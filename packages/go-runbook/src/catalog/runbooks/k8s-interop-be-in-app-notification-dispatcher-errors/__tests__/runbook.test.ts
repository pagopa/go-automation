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
import { IN_APP_NOTIFICATION_DISPATCHER_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

const KAFKA_REJOIN =
  'The coordinator is not aware of this member, re-joining the group - The coordinator is not aware of this member';

interface Scenario {
  readonly applicationMessage: string;
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
      const rows: ReadonlyArray<ReadonlyArray<ResultField>> =
        message === undefined
          ? []
          : [
              [
                { field: '@timestamp', value: '2026-10-05 08:00:00.000' },
                { field: 'pod_app', value: tracker ? 'interop-be-other-consumer' : alarm.podApp },
                { field: '@message', value: JSON.stringify({ log: `2026-10-05T08:00:00.000Z ERROR - ${message}` }) },
                ...(scenario.cid === undefined || tracker ? [] : [{ field: 'cid', value: scenario.cid }]),
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

describe('in-app notification dispatcher runbook', () => {
  it('registers all three documented environments and resolves their application log groups', () => {
    for (const environment of ['prod', 'att', 'test'] as const) {
      const alarmName = `k8s-interop-be-in-app-notification-dispatcher-errors-${environment}`;
      const resolved = RUNBOOK_CATALOG.resolveByAlarmName(alarmName);
      assert.ok(resolved);
      assert.strictEqual(resolved.descriptor.key, alarm.runbookKey);
      assert.strictEqual(resolved.product, 'INTEROP');
      assert.strictEqual(resolved.descriptor.kind, 'K8S');
      assert.strictEqual(alarm.resolveContext(alarmName).environment, environment);
      assert.strictEqual(alarm.resolveContext(alarmName).podApp, 'interop-be-in-app-notification-dispatcher');
      assert.strictEqual(
        alarm.resolveContext(alarmName).logGroup,
        `/aws/eks/interop-eks-cluster-${environment}/application`,
      );
    }
    assert.strictEqual(RUNBOOK_CATALOG.resolveByKey(alarm.runbookKey)?.descriptor.key, alarm.runbookKey);
    assert.throws(() => alarm.resolveContext(`${alarm.runbookKey}-dev`), /Unsupported INTEROP alarm/u);
    assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName(`${alarm.runbookKey}-dev`), undefined);
  });

  it('publishes the source and documented occurrence window for cloud execution', () => {
    const runbook = buildRunbook();
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 1 });
    assert.deepStrictEqual(runbook.analysisDefaults?.resources, [{ name: alarm.podApp, role: 'PRIMARY' }]);
    assert.strictEqual(
      runbook.analysisDefaults?.links?.[0]?.url,
      'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3062825037/k8s-interop-be-in-app-notification-dispatcher-errors',
    );
  });

  it('recognizes the production case without a CID and keeps the investigation open', async () => {
    const { draft, queries, logGroups } = await execute('prod', { applicationMessage: KAFKA_REJOIN });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(draft.downstreams, [INTEROP_DOWNSTREAMS.SELFCARE]);
    assert.ok(draft.links.some(({ url }) => url === 'https://pagopa.atlassian.net/browse/PIN-7325'));
    assert.deepStrictEqual(logGroups, ['/aws/eks/interop-eks-cluster-prod/application']);
    assert.strictEqual(queries.length, 1);
    assert.ok(queries[0]?.includes('pod_app like /interop\\-be\\-in\\-app\\-notification\\-dispatcher/'));
    assert.ok(queries[0]?.includes('(@message like /ERROR/ or stream = "stderr")'));
    assert.ok(queries[0]?.includes('@logStream not like /adot-collector/'));
    assert.ok(!queries[0]?.includes('(?i)s3'));
  });

  it('retrieves evidence from other services through the CID tracker', async () => {
    const { draft, queries, result } = await execute('prod', {
      applicationMessage: KAFKA_REJOIN,
      cid: 'dispatcher-cid',
      trackerMessage: 'Correlated request failed',
    });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(queries.length, 2);
    assert.ok(queries[1]?.includes('filter cid = "dispatcher-cid"'));
    assert.ok(!queries[1]?.includes('filter pod_app'));
    assert.strictEqual(result.finalContext.vars.get('interopCidTrackerLogCount'), '1');
  });

  for (const environment of ['att', 'test'] as const) {
    it(`leaves the Kafka message unclassified in ${environment}, where the case is not documented`, async () => {
      const { draft, logGroups } = await execute(environment, { applicationMessage: KAFKA_REJOIN });
      assert.notStrictEqual(draft?.kind, 'KNOWN_CASE');
      assert.deepStrictEqual(logGroups, [`/aws/eks/interop-eks-cluster-${environment}/application`]);
    });
  }

  it('does not attribute an unrelated consumer’s Kafka error to the dispatcher', async () => {
    const { draft } = await execute('prod', {
      applicationMessage: 'Unknown dispatcher error',
      cid: 'dispatcher-cid',
      trackerMessage: KAFKA_REJOIN,
    });
    assert.notStrictEqual(draft?.kind, 'KNOWN_CASE');
  });

  it('does not import other services’ broader Kafka cases', async () => {
    for (const applicationMessage of [
      'The coordinator is not aware of this member',
      'The group coordinator is not available',
      'Connection error: read ECONNRESET',
      'Unknown notification dispatcher error',
    ]) {
      const { draft } = await execute('prod', { applicationMessage });
      assert.notStrictEqual(draft?.kind, 'KNOWN_CASE');
    }
  });
});
