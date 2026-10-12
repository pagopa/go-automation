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
import { AGREEMENT_READMODEL_WRITER_SQL_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

const KAFKA_REJOIN = 'The coordinator is not aware of this member, re-joining the group';
const JIRA_REJOIN = `${KAFKA_REJOIN} - The coordinator is not aware of this member`;

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
      const podApp = tracker ? 'interop-be-compute-agreements-consumer' : alarm.podApp;
      const cidBlock = scenario.cid === undefined ? '' : `[CID=${scenario.cid}] `;
      const rows: ReadonlyArray<ReadonlyArray<ResultField>> =
        message === undefined
          ? []
          : [
              [
                { field: '@timestamp', value: '2026-02-13 13:51:15.195' },
                { field: 'pod_app', value: podApp },
                {
                  field: '@message',
                  value: JSON.stringify({
                    log: `2026-02-13T13:51:14.371Z ${tracker ? 'INFO' : 'ERROR'} - ${cidBlock}${message}`,
                    pod_app: podApp,
                    pod_namespace: environment,
                    stream: tracker ? 'stdout' : 'stderr',
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
      ['startTime', '2026-02-13T13:46:15.195Z'],
      ['endTime', '2026-02-13T13:52:15.195Z'],
    ]),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
  return { draft: buildAnalysisDraft(runbook, result), logGroups, queries, result };
}

describe('agreement readmodel writer SQL runbook', () => {
  it('registers the documented alarm names for all environments with the correct writer and log group', () => {
    for (const environment of ['prod', 'att', 'test'] as const) {
      const alarmName = `${alarm.runbookKey}-${environment}`;
      const resolved = RUNBOOK_CATALOG.resolveByAlarmName(alarmName);
      assert.strictEqual(resolved?.descriptor.key, alarm.runbookKey);
      assert.strictEqual(resolved?.product, 'INTEROP');
      assert.strictEqual(resolved?.descriptor.kind, 'K8S');
      assert.strictEqual(alarm.resolveContext(alarmName).podApp, 'interop-be-agreement-readmodel-writer-sql');
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

  it('publishes the canonical source URL, occurrence window and read-only cloud policy', () => {
    const runbook = buildRunbook();
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 1 });
    assert.deepStrictEqual(runbook.analysisDefaults?.resources, [{ name: alarm.podApp, role: 'PRIMARY' }]);
    assert.strictEqual(runbook.analysisDefaults?.runbookName, alarm.runbookKey);
    assert.strictEqual(
      runbook.analysisDefaults?.links?.[0]?.url,
      'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3212745125/k8s-interop-be-agreement-readmodel-writer-sql-errors',
    );
  });

  it('recognizes the Prod case without a CID while keeping cause and recovery open for verification', async () => {
    const { draft, queries, logGroups, result } = await execute('prod', { applicationMessage: KAFKA_REJOIN });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(draft.downstreams, [INTEROP_DOWNSTREAMS.NESSUNO]);
    assert.match(draft.conclusionNotes, /causa.*resta da verificare/u);
    assert.match(draft.conclusionNotes, /elaborazione lenta/u);
    assert.match(draft.conclusionNotes, /commento 293001/u);
    assert.match(draft.conclusionNotes, /assenza.*pod e intervallo temporale/u);
    assert.ok(draft.links.some(({ url }) => url === 'https://pagopa.atlassian.net/browse/PIN-7325'));
    assert.ok(draft.links.some(({ url }) => url.endsWith('/p1773057607941239')));
    assert.deepStrictEqual(logGroups, ['/aws/eks/interop-eks-cluster-prod/application']);
    assert.strictEqual(queries.length, 1);
    assert.ok(queries[0]?.includes('(log like /ERROR/ or stream = "stderr")'));
    assert.ok(queries[0]?.includes('pod_app = "interop-be-agreement-readmodel-writer-sql"'));
    assert.ok(queries[0]?.includes('@logStream not like /adot-collector/'));
    assert.ok(queries[0]?.includes('sort @timestamp asc'));
    assert.ok(!queries[0]?.includes('@message like /ERROR/'));
    assert.ok(!queries[0]?.includes('eservice-template'));
    assert.strictEqual(result.finalContext.vars.get('interopCidTrackerExecuted'), 'false');
  });

  it('recognizes the full message in the source Jira log and the extra spacing used by KafkaJS', async () => {
    for (const applicationMessage of [JIRA_REJOIN, KAFKA_REJOIN.replace(', ', ',  ')]) {
      const { draft } = await execute('prod', { applicationMessage });
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    }
  });

  for (const environment of ['test', 'att'] as const) {
    it(`does not extend the Prod case to undocumented ${environment} occurrences`, async () => {
      const { draft, result, logGroups } = await execute(environment, { applicationMessage: KAFKA_REJOIN });
      assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
      assert.strictEqual(result.matchedCases.length, 0);
      assert.deepStrictEqual(logGroups, [`/aws/eks/interop-eks-cluster-${environment}/application`]);
    });
  }

  it('extracts the CID from a JSON log and collects correlated INFO evidence across services', async () => {
    const { draft, queries, result } = await execute('prod', {
      applicationMessage: KAFKA_REJOIN,
      cid: 'agreement-cid',
      trackerMessage: 'Correlated processing resumed',
    });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(queries.length, 2);
    assert.ok(queries[1]?.includes('filter cid = "agreement-cid"'));
    assert.ok(!queries[1]?.includes('filter pod_app'));
    assert.ok(!queries[1]?.includes('/ERROR/'));
    assert.strictEqual(result.finalContext.vars.get(`${alarm.varPrefix}CidCount`), '1');
    assert.strictEqual(result.finalContext.vars.get('interopCidTrackerLogCount'), '1');
  });

  it('does not attribute another consumer’s tracker error to the agreement writer', async () => {
    const { draft, result } = await execute('prod', {
      applicationMessage: 'Unknown SQL writer error',
      cid: 'agreement-cid',
      trackerMessage: KAFKA_REJOIN,
    });
    assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    assert.strictEqual(result.matchedCases.length, 0);
  });

  it('does not generalize the case to heartbeat-only messages, network errors or SQL errors', async () => {
    for (const applicationMessage of [
      'Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member',
      'The group coordinator is not available',
      'Connection error: read ECONNRESET',
      'Error writing agreement to SQL',
      'The coordinator is not aware of this member, re-joining the grouped',
    ]) {
      const { draft, result } = await execute('prod', { applicationMessage });
      assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
      assert.strictEqual(result.matchedCases.length, 0);
    }
  });

  it('preserves empty evidence as unknown without querying the CID tracker', async () => {
    const { draft, queries, result } = await execute('prod', {});
    assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    assert.strictEqual(result.matchedCases.length, 0);
    assert.strictEqual(queries.length, 1);
  });
});
