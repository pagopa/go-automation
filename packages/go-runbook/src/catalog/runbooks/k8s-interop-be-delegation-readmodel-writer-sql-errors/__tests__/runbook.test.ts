import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { INTEROP_DOWNSTREAMS } from '../../framework.js';
import type { InteropEnvironment } from '../../interop/InteropEnvironment.js';
import { DELEGATION_READMODEL_WRITER_SQL_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

const KAFKA_REJOIN =
  'The coordinator is not aware of this member, re-joining the group - The coordinator is not aware of this member';

interface Scenario {
  readonly applicationMessage?: string;
  readonly cid?: string;
  readonly trackerMessage?: string;
}

interface TestExecution {
  readonly draft: ReturnType<typeof buildAnalysisDraft>;
  readonly logGroups: ReadonlyArray<string>;
  readonly queries: ReadonlyArray<string>;
  readonly result: RunbookExecutionResult;
}

async function execute(environment: InteropEnvironment, scenario: Scenario): Promise<TestExecution> {
  const logGroups: string[] = [];
  const queries: string[] = [];
  const cloudWatchLogs = {
    async queryWithStatistics(groups: ReadonlyArray<string>, query: string): Promise<AWSCloudWatchLogsQueryResult> {
      await Promise.resolve();
      logGroups.push(...groups);
      queries.push(query);
      const tracker = query.includes('filter cid =');
      const message = tracker ? scenario.trackerMessage : scenario.applicationMessage;
      const podApp = tracker ? 'interop-be-delegation-outbound-writer' : alarm.podApp;
      const cidBlock = scenario.cid === undefined ? '' : `[CID=${scenario.cid}] `;
      const rows: ReadonlyArray<ReadonlyArray<ResultField>> =
        message === undefined
          ? []
          : [
              [
                { field: '@timestamp', value: '2026-10-05 08:00:00.000' },
                { field: 'pod_app', value: podApp },
                {
                  field: '@message',
                  value: JSON.stringify({
                    log: `2026-10-05T08:00:00.000Z ERROR - ${cidBlock}${message}`,
                    pod_app: podApp,
                    stream: 'stderr',
                  }),
                },
              ],
            ];
      return {
        rows,
        statistics: { bytesScanned: 1, recordsScanned: 1, recordsMatched: 1 },
        queryExecutions: [],
      };
    },
  };
  const runbook = buildRunbook();
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['alarmName', `${alarm.runbookKey}-${environment}`],
      ['startTime', '2026-10-05T07:55:00.000Z'],
      ['endTime', '2026-10-05T08:01:00.000Z'],
    ]),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
  return { draft: buildAnalysisDraft(runbook, result), logGroups, queries, result };
}

describe('delegation readmodel writer SQL runbook', () => {
  it('registers the plural alarm names documented for all three environments', () => {
    for (const environment of ['prod', 'att', 'test'] as const) {
      const alarmName = `k8s-interop-be-delegation-readmodel-writer-sql-errors-${environment}`;
      const resolved = RUNBOOK_CATALOG.resolveByAlarmName(alarmName);
      assert.ok(resolved);
      assert.strictEqual(resolved.descriptor.key, alarm.runbookKey);
      assert.strictEqual(resolved.product, 'INTEROP');
      assert.strictEqual(resolved.descriptor.kind, 'K8S');
      assert.strictEqual(alarm.resolveContext(alarmName).environment, environment);
      assert.strictEqual(alarm.resolveContext(alarmName).podApp, 'interop-be-delegation-readmodel-writer-sql');
      assert.strictEqual(
        alarm.resolveContext(alarmName).logGroup,
        `/aws/eks/interop-eks-cluster-${environment}/application`,
      );
      assert.strictEqual(
        RUNBOOK_CATALOG.resolveByAlarmName(`k8s-interop-be-delegation-readmodel-writer-sql-error-${environment}`),
        undefined,
      );
    }
    assert.strictEqual(RUNBOOK_CATALOG.resolveByKey(alarm.runbookKey)?.descriptor.key, alarm.runbookKey);
    assert.throws(() => alarm.resolveContext(`${alarm.runbookKey}-dev`), /Unsupported INTEROP alarm/u);
  });

  it('publishes the source page and the documented occurrence window for cloud execution', () => {
    const runbook = buildRunbook();
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 1 });
    assert.deepStrictEqual(runbook.analysisDefaults?.resources, [{ name: alarm.podApp, role: 'PRIMARY' }]);
    assert.strictEqual(runbook.analysisDefaults?.runbookName, alarm.runbookKey);
    assert.strictEqual(
      runbook.analysisDefaults?.links?.[0]?.url,
      'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3070787770/k8s-interop-be-delegation-readmodel-writer-sql-error',
    );
  });

  for (const environment of ['prod', 'att'] as const) {
    it(`recognizes the documented Kafka case without a CID in ${environment}`, async () => {
      const { draft, queries, logGroups, result } = await execute(environment, { applicationMessage: KAFKA_REJOIN });
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
      assert.deepStrictEqual(draft.downstreams, [INTEROP_DOWNSTREAMS.NESSUNO]);
      assert.ok(draft.links.some(({ url }) => url === 'https://pagopa.atlassian.net/browse/PIN-7325'));
      assert.deepStrictEqual(logGroups, [`/aws/eks/interop-eks-cluster-${environment}/application`]);
      assert.strictEqual(queries.length, 1);
      assert.ok(queries[0]?.includes('pod_app like /interop\\-be\\-delegation\\-readmodel\\-writer\\-sql/'));
      assert.ok(queries[0]?.includes('(@message like /ERROR/ or stream = "stderr")'));
      assert.ok(queries[0]?.includes('@logStream not like /adot-collector/'));
      assert.strictEqual(result.finalContext.vars.get('interopCidTrackerExecuted'), 'false');
    });
  }

  it('keeps the same message unclassified in test, where the case is not documented', async () => {
    const { draft, result, logGroups } = await execute('test', { applicationMessage: KAFKA_REJOIN });
    assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    assert.strictEqual(result.matchedCases.length, 0);
    assert.deepStrictEqual(logGroups, ['/aws/eks/interop-eks-cluster-test/application']);
  });

  it('extracts a CID from the JSON log and retrieves evidence across services', async () => {
    const { draft, queries, result } = await execute('att', {
      applicationMessage: KAFKA_REJOIN,
      cid: 'delegation-cid',
      trackerMessage: 'Correlated request failed',
    });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(queries.length, 2);
    assert.ok(queries[1]?.includes('filter cid = "delegation-cid"'));
    assert.ok(!queries[1]?.includes('filter pod_app'));
    assert.strictEqual(result.finalContext.vars.get(`${alarm.varPrefix}CidCount`), '1');
    assert.strictEqual(result.finalContext.vars.get('interopCidTrackerLogCount'), '1');
  });

  it('does not confuse the delegation outbound writer with the readmodel writer', async () => {
    const { draft, result } = await execute('prod', {
      applicationMessage: 'Unknown SQL writer error',
      cid: 'delegation-cid',
      trackerMessage: KAFKA_REJOIN,
    });
    assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    assert.strictEqual(result.matchedCases.length, 0);
  });

  it('does not extend the case to heartbeat messages or other services’ Kafka errors', async () => {
    for (const applicationMessage of [
      'The coordinator is not aware of this member',
      'The group coordinator is not available',
      'Connection error: read ECONNRESET',
      'Error writing delegation to SQL',
    ]) {
      const { draft, result } = await execute('prod', { applicationMessage });
      assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
      assert.strictEqual(result.matchedCases.length, 0);
    }
  });

  it('keeps an empty log scan open for investigation without querying the CID tracker', async () => {
    const { draft, queries, result } = await execute('prod', {});
    assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    assert.strictEqual(result.matchedCases.length, 0);
    assert.strictEqual(queries.length, 1);
  });
});
