import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOLogger } from '@go-automation/go-common/core';
import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { NOTIFICATION_SCHEDULER_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

const HEARTBEAT = 'ERROR - Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member';
const REJOIN =
  'ERROR - The coordinator is not aware of this member, re-joining the group - The coordinator is not aware of this member';

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
          const log = tracker ? HEARTBEAT : context ? 'INFO - AWS authentication token obtained' : message;
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

describe('notification scheduler verified occurrence execution', () => {
  for (const message of [HEARTBEAT, REJOIN]) {
    const expected = 'notification-scheduler-kafka-member-rejoin';
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

      assert.strictEqual(queries.length, 2);
      assert.ok(queries[0]?.includes(`pod_app = "${alarm.podApp}"`));
      assert.ok(!queries[0]?.includes('@message like /ERROR/'));
      assert.ok(!queries[1]?.includes('log like /ERROR/'));
      assert.strictEqual(result.finalContext.vars.get('interopCidTrackerExecuted'), 'false');
    });
  }
  it('does not attribute another service’s coordinator error to the scheduler', async () => {
    const { result, queries } = await execute('prod', 'ERROR - Unknown application failure', true);
    assert.strictEqual(queries.length, 3);
    assert.strictEqual(result.matchedCases.length, 0);
  });
  it('does not extend production known cases to test or att', async () => {
    for (const environment of ['test', 'att']) {
      const { result } = await execute(environment, HEARTBEAT);
      assert.strictEqual(result.matchedCases.length, 0);
    }
  });
  it('does not treat empty scans or context access failures as successful recovery', async () => {
    const empty = await execute('prod', undefined);
    assert.strictEqual(empty.result.matchedCases.length, 0);
    const denied = await execute('prod', HEARTBEAT, false, true);
    assert.strictEqual(denied.result.status, 'failed');
    assert.notStrictEqual(denied.draft?.kind, 'KNOWN_CASE');
  });
});
