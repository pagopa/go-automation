import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { NOTIFICATION_USER_LIFECYCLE_ALARM as ALARM } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

const METADATA = 'ERROR - Crash: KafkaJSNumberOfRetriesExceeded: Request Metadata(key: 3, version: 6) timed out';
const DUPLICATE =
  'ERROR - Error creating event: error: duplicate key value violates unique constraint "events_stream_id_version_key"';
const CONFLICT =
  'ERROR - Error removing role api from notification config for user <uuid> in tenant <uuid>. Reason: AxiosError: Request failed with status code 409';
const TENANT =
  'ERROR - Error handling Kafka message. Topic: sc-users. Reason: Error: Tenant not found for selfcareId: <uuid>';

interface Execution {
  readonly result: RunbookExecutionResult;
  readonly draft: ReturnType<typeof buildAnalysisDraft>;
  readonly queries: ReadonlyArray<string>;
}

async function execute(
  messages: ReadonlyArray<string>,
  trackerMessages: ReadonlyArray<string> = [],
  cid?: string,
): Promise<Execution> {
  const queries: string[] = [];
  const services = createTestServiceRegistry({
    cloudWatchLogs: {
      async queryWithStatistics(groups: ReadonlyArray<string>, query: string): Promise<AWSCloudWatchLogsQueryResult> {
        await Promise.resolve();
        assert.deepStrictEqual(groups, ['/aws/eks/interop-eks-cluster-prod/application']);
        queries.push(query);
        const tracker = query.includes('filter cid =');
        const podApp = tracker ? 'interop-be-another-service' : ALARM.podApp;
        const rows: ReadonlyArray<ReadonlyArray<ResultField>> = (tracker ? trackerMessages : messages).map(
          (message) => [
            { field: 'pod_app', value: podApp },
            {
              field: '@message',
              value: JSON.stringify({
                pod_app: podApp,
                stream: 'stderr',
                log: `2026-10-23T02:19:34.344Z ${cid === undefined ? '' : `[CID=${cid}] `}${message}`,
              }),
            },
          ],
        );
        return {
          rows,
          statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
          queryExecutions: [],
        };
      },
    },
  });
  const runbook = buildRunbook();
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['alarmName', `${ALARM.runbookKey}-prod`],
      ['startTime', '2026-10-23T02:15:55.000Z'],
      ['endTime', '2026-10-23T02:25:55.000Z'],
    ]),
    services,
  );
  return { result, draft: buildAnalysisDraft(runbook, result), queries };
}

describe('notification user lifecycle execution', () => {
  it('recognizes the observed metadata timeout without requiring a CID or asserting recovery', async () => {
    const { result, draft, queries } = await execute([METADATA, 'ERROR - Connection error: read ECONNRESET']);
    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(result.matchedCases[0]?.id, 'notification-kafka-metadata-timeout');
    assert.strictEqual(queries.length, 1);
    assert.strictEqual(result.finalContext.vars.get(`${ALARM.varPrefix}CidCount`), '0');
  });

  it('collects the CID in date order while refusing to close from another service’s duplicate event', async () => {
    const { result, draft, queries } = await execute(['ERROR - Unknown consumer failure'], [DUPLICATE], 'consumer-cid');
    assert.strictEqual(queries.length, 2);
    assert.match(queries[1] ?? '', /filter cid = "consumer-cid"/u);
    assert.match(queries[1] ?? '', /sort date asc/u);
    assert.deepStrictEqual(result.matchedCases, []);
    assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
  });

  it('preserves the documented no-action result for a duplicate emitted by this service', async () => {
    const { draft } = await execute([DUPLICATE]);
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'COMPLETED');
    assert.strictEqual(draft.conclusionNotes, 'Nessuna azione necessaria.');
  });

  it('keeps unresolved HTTP 409 and tenant errors ahead of no-action cases in a mixed window', async () => {
    for (const unresolved of [CONFLICT, TENANT, METADATA]) {
      const { draft, result } = await execute([DUPLICATE, unresolved]);
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
      assert.notStrictEqual(result.matchedCases[0]?.id, 'notification-duplicate-event-stream-version');
    }
  });

  it('keeps empty logs and unrecognized messages unknown', async () => {
    for (const messages of [[], ['ERROR - Unknown application exception']]) {
      const { result, draft } = await execute(messages);
      assert.deepStrictEqual(result.matchedCases, []);
      assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    }
  });
});
