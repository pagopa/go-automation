import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOLogger } from '@go-automation/go-common/core';
import type { ResultField } from '@go-automation/go-common/aws';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { buildRunbook } from '../runbook.js';
import { DELEGATION_OUTBOUND_WRITER_ALARM as alarm } from '../alarmDefinition.js';
import { DELEGATION_OUTBOUND_WRITER_QUERY_PROFILE } from '../queryProfile.js';

const HEARTBEAT = 'ERROR - Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member';
const REJOIN = 'ERROR - The coordinator is not aware of this member, re-joining the group';
const REFUSED = 'ERROR - Connection error: connect ECONNREFUSED 10.0.0.10:9098';
const CRASH =
  'ERROR - Error Consumer crashed {"type":"consumer.crash","payload":{"error":{"name":"KafkaJSNumberOfRetriesExceeded"},"restart":false}}.';
const COORDINATOR =
  'ERROR - Response Heartbeat(key: 12, version: 3) - This is not the correct coordinator for this group';

async function execute(
  messages: ReadonlyArray<string>,
  environment = 'prod',
  cid = false,
  denied = false,
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
      ['startTime', '2026-10-06T17:54:08Z'],
      ['endTime', '2026-10-06T18:19:08Z'],
    ]),
    createTestServiceRegistry({
      cloudWatchLogs: {
        // eslint-disable-next-line @typescript-eslint/require-await
        async queryWithStatistics(groups: ReadonlyArray<string>, query: string) {
          assert.deepStrictEqual(groups, [`/aws/eks/interop-eks-cluster-${environment}/application`]);
          queries.push(query);
          const tracker = query.includes('filter cid =');
          const context = query.includes('limit 1000');
          if (context && denied) throw new Error('AccessDenied');
          const values = tracker
            ? [HEARTBEAT]
            : context
              ? ['WARN - Error during restart service', ...messages]
              : messages;
          const rows: ReadonlyArray<ReadonlyArray<ResultField>> = values.map((log) => [
            { field: 'pod_app', value: tracker ? 'another-service' : alarm.podApp },
            { field: 'log', value: log },
            { field: '@message', value: JSON.stringify({ log: `${cid ? '[CID=test-cid] ' : ''}${log}` }) },
          ]);
          return {
            rows,
            statistics: { recordsMatched: rows.length, recordsScanned: rows.length, bytesScanned: 1 },
            queryExecutions: [],
          };
        },
      },
    }),
  );
  return { result, queries, draft: buildAnalysisDraft(runbook, result) };
}

describe('delegation outbound writer evidence execution', () => {
  for (const [message, expected] of [
    [HEARTBEAT, 'heartbeat-unknown-member'],
    [REJOIN, 'heartbeat-unknown-member'],
    [REFUSED, 'connection-refused'],
    [CRASH, 'retries-exhausted'],
    [
      'ERROR - Crash: KafkaJSNumberOfRetriesExceeded: Connection error: connect ECONNREFUSED 10.0.0.10:9098',
      'retries-exhausted',
    ],
    [COORDINATOR, 'wrong-coordinator'],
    [
      'ERROR - Response JoinGroup(key: 11, version: 5) - This is not the correct coordinator for this group',
      'wrong-coordinator',
    ],
  ] as const) {
    it(`recognizes ${expected} without CID and keeps recovery checks open`, async () => {
      const { result, queries, draft } = await execute([message]);
      assert.strictEqual(result.status, 'completed');
      assert.strictEqual(result.matchedCases[0]?.id, `delegation-outbound-writer-kafka-${expected}`);
      assert.strictEqual(queries.length, 2);
      assert.strictEqual(result.finalContext.vars.get('interopCidTrackerExecuted'), 'false');
      assert.ok(queries[1]?.includes('limit 1000'));
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
      assert.strictEqual(draft.analysisType, 'ANALYZABLE');
      assert.strictEqual(draft.ignoreReasonCode, undefined);
    });
  }
  it('prioritizes the crash when connection failures and coordinator errors coexist', async () => {
    const { result } = await execute([REFUSED, CRASH, COORDINATOR]);
    assert.deepStrictEqual(
      result.matchedCases.map((c) => c.id),
      [
        'delegation-outbound-writer-kafka-retries-exhausted',
        'delegation-outbound-writer-kafka-connection-refused',
        'delegation-outbound-writer-kafka-wrong-coordinator',
      ],
    );
  });
  it('does not extend production cases to att/test or attribute another service’s CID error', async () => {
    for (const env of ['att', 'test'])
      assert.deepStrictEqual((await execute([HEARTBEAT], env)).result.matchedCases, []);
    const { result, queries } = await execute(['ERROR - Unrecognized writer failure'], 'prod', true);
    assert.strictEqual(queries.length, 3);
    assert.deepStrictEqual(result.matchedCases, []);
  });
  it('does not infer recovery from empty scans or context access failures', async () => {
    assert.deepStrictEqual((await execute([])).result.matchedCases, []);
    const denied = await execute([COORDINATOR], 'prod', false, true);
    assert.strictEqual(denied.result.status, 'failed');
    assert.notStrictEqual(denied.draft?.kind, 'KNOWN_CASE');
  });
  it('matches the application log field with an exact service filter and preserves complete evidence', () => {
    const query = DELEGATION_OUTBOUND_WRITER_QUERY_PROFILE.buildApplicationLogsQuery(alarm.podApp);
    assert.match(query, /filter pod_app = "interop-be-delegation-outbound-writer"/);
    assert.match(query, /filter log like \/ERROR\/ or stream = "stderr"/);
    assert.doesNotMatch(query, /parse log|dedup/);
    assert.match(query, /@logStream, stream, log, @message/);
  });
});
