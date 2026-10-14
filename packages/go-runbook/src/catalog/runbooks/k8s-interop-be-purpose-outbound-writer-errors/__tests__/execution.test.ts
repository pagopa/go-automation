import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOLogger } from '@go-automation/go-common/core';
import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { PURPOSE_OUTBOUND_WRITER_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

const REFUSED = 'ERROR - Connection error: connect ECONNREFUSED 10.0.38.131:9098';
const CRASH =
  'ERROR - Error Consumer crashed {"type":"consumer.crash","payload":{"error":{"name":"KafkaJSNumberOfRetriesExceeded"},"restart":false}}.';
const COORDINATOR =
  'ERROR - Response Heartbeat(key: 12, version: 3) - This is not the correct coordinator for this group';

async function execute(
  environment: string,
  message: string | undefined,
  cid = false,
  failContext = false,
): Promise<{
  result: RunbookExecutionResult;
  queries: string[];
  draft: ReturnType<typeof buildAnalysisDraft>;
}> {
  const queries: string[] = [];
  const runbook = buildRunbook();
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['alarmName', `${alarm.runbookKey}-${environment}`],
      ['startTime', '2026-10-06T17:30:00Z'],
      ['endTime', '2026-10-06T18:05:00Z'],
    ]),
    createTestServiceRegistry({
      cloudWatchLogs: {
        // eslint-disable-next-line @typescript-eslint/require-await
        async queryWithStatistics(groups: ReadonlyArray<string>, query: string): Promise<AWSCloudWatchLogsQueryResult> {
          assert.deepStrictEqual(groups, [`/aws/eks/interop-eks-cluster-${environment}/application`]);
          queries.push(query);
          const tracker = query.includes('filter cid =');
          const context = !tracker && !query.includes('log like /ERROR/');
          if (context && failContext) throw new Error('AccessDenied');
          const log = tracker
            ? COORDINATOR
            : context
              ? 'INFO - Consumer subscribed topic event-store.prod_purpose.events'
              : message;
          const rows: ReadonlyArray<ReadonlyArray<ResultField>> =
            log === undefined
              ? []
              : [
                  [
                    { field: '@timestamp', value: '2026-10-06 17:47:16.765' },
                    { field: 'pod_app', value: tracker ? 'interop-be-other-service' : alarm.podApp },
                    { field: '@message', value: JSON.stringify({ log: `${cid ? '[CID=test-cid] ' : ''}${log}` }) },
                  ],
                ];
          return {
            rows,
            statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
            queryExecutions: [],
          };
        },
      },
    }),
  );
  return { result, queries, draft: buildAnalysisDraft(runbook, result) };
}

describe('purpose outbound writer verified occurrence execution', () => {
  for (const [message, expected] of [
    [REFUSED, 'purpose-outbound-writer-kafka-connection-refused'],
    [CRASH, 'purpose-outbound-writer-kafka-retries-exhausted'],
    [COORDINATOR, 'purpose-outbound-writer-kafka-wrong-coordinator'],
    [
      'ERROR - The coordinator is not aware of this member, re-joining the group',
      'purpose-outbound-writer-kafka-member-rejoin',
    ],
  ] as const) {
    it(`recognizes ${expected} without CID and requires recovery checks`, async () => {
      const { result, queries, draft } = await execute('prod', message);
      assert.deepStrictEqual(
        result.matchedCases.map(({ id }) => id),
        [expected],
      );
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
      assert.strictEqual(draft.analysisType, 'ANALYZABLE');
      assert.strictEqual(draft.ignoreReasonCode, undefined);
      assert.deepStrictEqual(draft.finalActions, ['Necessario confronto con il team di prodotto']);
      assert.strictEqual(queries.length, 2);
      assert.ok(queries[0]?.includes(`pod_app = "${alarm.podApp}"`));
      assert.ok(!queries[0]?.includes('@message like /ERROR/'));
      assert.ok(!queries[1]?.includes('log like /ERROR/'));
      assert.strictEqual(result.finalContext.vars.get('interopCidTrackerExecuted'), 'false');
      assert.match(draft.conclusionNotes, /non provano da soli il recupero/);
    });
  }
  it('does not attribute another service’s coordinator error to the writer', async () => {
    const { result, queries } = await execute('prod', 'ERROR - Unknown application failure', true);
    assert.strictEqual(queries.length, 3);
    assert.strictEqual(result.matchedCases.length, 0);
  });
  it('does not extend production known cases to test or att', async () => {
    for (const environment of ['test', 'att']) {
      const { result } = await execute(environment, COORDINATOR);
      assert.strictEqual(result.matchedCases.length, 0);
    }
  });
  it('does not treat empty scans or context access failures as successful recovery', async () => {
    const empty = await execute('prod', undefined);
    assert.strictEqual(empty.result.matchedCases.length, 0);
    const denied = await execute('prod', COORDINATOR, false, true);
    assert.strictEqual(denied.result.status, 'failed');
    assert.notStrictEqual(denied.draft?.kind, 'KNOWN_CASE');
  });
});
