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
import { ESERVICE_TEMPLATE_INSTANCES_UPDATER_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

const HEARTBEAT = 'Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member';
const REJOIN =
  'The coordinator is not aware of this member, re-joining the group - The coordinator is not aware of this member';

interface Scenario {
  readonly applicationMessages?: ReadonlyArray<string>;
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
      const messages = tracker
        ? scenario.trackerMessage === undefined
          ? []
          : [scenario.trackerMessage]
        : (scenario.applicationMessages ?? []);
      const podApp = tracker ? 'interop-be-eservice-template-readmodel-writer-sql' : alarm.podApp;
      const cidBlock = scenario.cid === undefined ? '' : `[CID=${scenario.cid}] `;
      const rows: ReadonlyArray<ReadonlyArray<ResultField>> = messages.map((message) => [
        { field: '@timestamp', value: '2026-09-30 12:58:01.056' },
        { field: 'pod_app', value: podApp },
        {
          field: '@message',
          value: JSON.stringify({
            log: `2026-09-30T12:58:00.527Z ${tracker ? 'INFO' : 'ERROR'} - ${cidBlock}${message}`,
            pod_app: podApp,
            pod_namespace: environment,
            stream: tracker ? 'stdout' : 'stderr',
          }),
        },
      ]);
      return {
        rows,
        statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
        queryExecutions: [],
      };
    },
  };
  const runbook = buildRunbook();
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['alarmName', `${alarm.runbookKey}-${environment}`],
      ['startTime', '2026-09-30T12:53:01.056Z'],
      ['endTime', '2026-09-30T12:59:01.056Z'],
    ]),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
  return { draft: buildAnalysisDraft(runbook, result), logGroups, queries, result };
}

describe('eservice template instances updater runbook', () => {
  it('registers the actual alarm names and exact updater pod for all documented environments', () => {
    for (const environment of ['prod', 'att', 'test'] as const) {
      const alarmName = `${alarm.runbookKey}-${environment}`;
      const resolved = RUNBOOK_CATALOG.resolveByAlarmName(alarmName);
      assert.strictEqual(resolved?.descriptor.key, alarm.runbookKey);
      assert.strictEqual(resolved?.product, 'INTEROP');
      assert.strictEqual(resolved?.descriptor.kind, 'K8S');
      assert.strictEqual(alarm.resolveContext(alarmName).podApp, 'interop-be-eservice-template-instances-updater');
      assert.strictEqual(alarm.resolveContext(alarmName).environment, environment);
      assert.strictEqual(
        alarm.resolveContext(alarmName).logGroup,
        `/aws/eks/interop-eks-cluster-${environment}/application`,
      );
      assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName(`${alarm.runbookKey}-errors-${environment}`), undefined);
    }
    assert.strictEqual(RUNBOOK_CATALOG.resolveByKey(alarm.runbookKey)?.descriptor.key, alarm.runbookKey);
    assert.throws(() => alarm.resolveContext(`${alarm.runbookKey}-dev`), /Unsupported INTEROP alarm/u);
  });

  it('publishes the source page, occurrence window and read-only cloud policy', () => {
    const runbook = buildRunbook();
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 1 });
    assert.deepStrictEqual(runbook.analysisDefaults?.resources, [{ name: alarm.podApp, role: 'PRIMARY' }]);
    assert.strictEqual(runbook.analysisDefaults?.runbookName, alarm.runbookKey);
    assert.strictEqual(
      runbook.analysisDefaults?.links?.[0]?.url,
      'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3367141537/k8s-interop-be-eservice-template-instances-updater-errors',
    );
  });

  for (const [stage, applicationMessage] of [
    ['heartbeat', HEARTBEAT],
    ['rejoin', REJOIN],
  ] as const) {
    it(`recognizes the documented ${stage} in Prod without a CID and keeps recovery open`, async () => {
      const { draft, queries, logGroups, result } = await execute('prod', {
        applicationMessages: [applicationMessage],
      });
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
      assert.deepStrictEqual(draft.downstreams, [INTEROP_DOWNSTREAMS.NESSUNO]);
      assert.match(draft.conclusionNotes, /commento 354627/u);
      assert.match(draft.conclusionNotes, /elaborazione lenta/u);
      assert.match(draft.conclusionNotes, /assenza cercare per pod e intervallo temporale/u);
      assert.ok(draft.links.some(({ url }) => url === 'https://pagopa.atlassian.net/browse/PIN-7325'));
      assert.deepStrictEqual(logGroups, ['/aws/eks/interop-eks-cluster-prod/application']);
      assert.strictEqual(queries.length, 1);
      assert.ok(queries[0]?.includes('(log like /ERROR/ or stream = "stderr")'));
      assert.ok(queries[0]?.includes('pod_app = "interop-be-eservice-template-instances-updater"'));
      assert.ok(queries[0]?.includes('@logStream not like /adot-collector/'));
      assert.ok(!queries[0]?.includes('@message like /ERROR/'));
      assert.ok(!queries[0]?.includes('catalog-platformstate-writer'));
      assert.strictEqual(result.finalContext.vars.get('interopCidTrackerExecuted'), 'false');
    });
  }

  it('recognizes heartbeat and rejoin together as one case with both log records preserved', async () => {
    const { draft, result } = await execute('prod', { applicationMessages: [HEARTBEAT, REJOIN] });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(result.matchedCases.length, 1);
    assert.strictEqual(result.finalContext.vars.get(`${alarm.varPrefix}LogCount`), '2');
  });

  it('accepts extra whitespace in the documented heartbeat fields and rejoin', async () => {
    for (const applicationMessage of [
      HEARTBEAT.replace('key: 12, version: 3', 'key:  12,  version:  3').replace(') - ', ')  -  '),
      REJOIN.replace(', ', ',  '),
    ]) {
      const { draft } = await execute('prod', { applicationMessages: [applicationMessage] });
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    }
  });

  for (const environment of ['test', 'att'] as const) {
    it(`does not extend the Prod case to undocumented ${environment} occurrences`, async () => {
      for (const applicationMessage of [HEARTBEAT, REJOIN]) {
        const { draft, result, logGroups } = await execute(environment, {
          applicationMessages: [applicationMessage],
        });
        assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
        assert.strictEqual(result.matchedCases.length, 0);
        assert.deepStrictEqual(logGroups, [`/aws/eks/interop-eks-cluster-${environment}/application`]);
      }
    });
  }

  it('extracts CIDs from JSON and reads correlated INFO evidence across services without closing the case', async () => {
    const { draft, queries, result } = await execute('prod', {
      applicationMessages: [HEARTBEAT, REJOIN],
      cid: 'instances-cid',
      trackerMessage: 'Correlated processing resumed',
    });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(queries.length, 2);
    assert.ok(queries[1]?.includes('filter cid = "instances-cid"'));
    assert.ok(!queries[1]?.includes('filter pod_app'));
    assert.ok(!queries[1]?.includes('/ERROR/'));
    assert.strictEqual(queries[1]?.split('sort @timestamp asc').length, 2);
    assert.strictEqual(result.finalContext.vars.get(`${alarm.varPrefix}CidCount`), '1');
    assert.strictEqual(result.finalContext.vars.get('interopCidTrackerLogCount'), '1');
  });

  it('does not attribute the template readmodel writer’s tracker errors to the instances updater', async () => {
    for (const trackerMessage of [HEARTBEAT, REJOIN]) {
      const { draft, result } = await execute('prod', {
        applicationMessages: ['Unknown updater error'],
        cid: 'instances-cid',
        trackerMessage,
      });
      assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
      assert.strictEqual(result.matchedCases.length, 0);
    }
  });

  it('keeps other Kafka operations, protocol versions, network errors and incomplete messages unclassified', async () => {
    for (const applicationMessage of [
      'The coordinator is not aware of this member',
      'The group coordinator is not available',
      'Response OffsetCommit(key: 8, version: 5) - The coordinator is not aware of this member',
      HEARTBEAT.replace('version: 3', 'version: 4'),
      HEARTBEAT.replace('key: 12', 'key: 13'),
      HEARTBEAT.replace('this member', 'this membership'),
      'Connection error: read ECONNRESET',
      'Error updating template instance',
    ]) {
      const { draft, result } = await execute('prod', { applicationMessages: [applicationMessage] });
      assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
      assert.strictEqual(result.matchedCases.length, 0);
    }
  });

  it('preserves an empty scan as unknown without running the CID tracker', async () => {
    const { draft, queries, result } = await execute('prod', {});
    assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    assert.strictEqual(result.matchedCases.length, 0);
    assert.strictEqual(queries.length, 1);
  });
});
