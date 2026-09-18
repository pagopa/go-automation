import { GOLogger } from '@go-automation/go-common/core';
import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { INTEROP_DOWNSTREAMS, service } from '../../framework.js';
import type { InteropEnvironment } from '../../interop/InteropEnvironment.js';
import { ESERVICE_TEMPLATE_READMODEL_WRITER_SQL_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';
import { buildRunbook } from '../runbook.js';

const KAFKA_MEMBER_REJOIN = 'The coordinator is not aware of this member, re-joining the group';

interface Scenario {
  readonly applicationMessage: string;
  readonly cid?: string;
  readonly trackerMessage?: string;
}

async function execute(
  environment: InteropEnvironment,
  scenario: Scenario,
): Promise<{
  readonly draft: ReturnType<typeof buildAnalysisDraft>;
  readonly logGroups: ReadonlyArray<string>;
  readonly queries: ReadonlyArray<string>;
  readonly result: RunbookExecutionResult;
}> {
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
                { field: '@timestamp', value: '2026-09-09 14:35:00.000' },
                { field: 'pod_app', value: tracker ? 'interop-be-kafka' : alarm.podApp },
                { field: '@message', value: JSON.stringify({ log: message }) },
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
      ['startTime', '2026-09-09T14:30:00.000Z'],
      ['endTime', '2026-09-09T14:36:00.000Z'],
    ]),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
  return { draft: buildAnalysisDraft(runbook, result), logGroups, queries, result };
}

describe('e-service template readmodel writer SQL runbook', () => {
  it('registers exactly the production and attestation alarms documented by Confluence', () => {
    assert.deepStrictEqual(alarm.alarmNames, [
      'k8s-interop-be-eservice-template-readmodel-writer-sql-errors-prod',
      'k8s-interop-be-eservice-template-readmodel-writer-sql-errors-att',
    ]);
    for (const environment of ['prod', 'att'] as const) {
      const alarmName = `${alarm.runbookKey}-${environment}`;
      assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName(alarmName)?.descriptor.key, alarm.runbookKey);
      assert.strictEqual(alarm.resolveContext(alarmName).environment, environment);
      assert.strictEqual(
        alarm.resolveContext(alarmName).logGroup,
        `/aws/eks/interop-eks-cluster-${environment}/application`,
      );
    }
    for (const environment of ['test', 'dev']) {
      const alarmName = `${alarm.runbookKey}-${environment}`;
      assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName(alarmName), undefined);
      assert.throws(() => alarm.resolveContext(alarmName), /Unsupported INTEROP alarm/u);
    }
  });

  it('builds the standard read-only pipeline with the documented window and source', () => {
    const runbook = buildRunbook();
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 1 });
    assert.deepStrictEqual(
      runbook.steps.map(({ step }) => step.id),
      [
        alarm.stepIds.resolveContext,
        alarm.stepIds.queryApplicationLogs,
        alarm.stepIds.analyzeApplicationLogs,
        alarm.stepIds.queryCidTracker,
        alarm.stepIds.analyzeCidTracker,
      ],
    );
    assert.ok(service.isServiceRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.service.name, alarm.podApp);
    assert.strictEqual(
      runbook.analysisDefaults?.links?.[0]?.url,
      'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3172728872/k8s-interop-be-eservice-template-readmodel-writer-sql-errors',
    );
  });

  for (const environment of ['prod', 'att'] as const) {
    it(`uses the correct service and environment-specific log group in ${environment}`, async () => {
      const { draft, logGroups, queries } = await execute(environment, {
        applicationMessage: KAFKA_MEMBER_REJOIN,
      });
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
      assert.deepStrictEqual(logGroups, [`/aws/eks/interop-eks-cluster-${environment}/application`]);
      assert.ok(queries[0]?.includes('pod_app like /interop\\-be\\-eservice\\-template\\-readmodel\\-writer\\-sql/'));
      assert.ok(!queries[0]?.includes('writer\\-sql\\-errors/'));
    });
  }

  it('recognizes the documented error in JSON-encoded CID tracker evidence', async () => {
    const { draft, queries, result } = await execute('prod', {
      applicationMessage: 'Generic request error',
      cid: 'eservice-template-cid',
      trackerMessage: KAFKA_MEMBER_REJOIN,
    });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['eservice-template-readmodel-writer-sql-kafka-coordinator-member-rejoin'],
    );
    assert.strictEqual(queries.length, 2);
    assert.match(queries[1] ?? '', /filter cid = "eservice-template-cid"/u);
  });

  it('models the documented Kafka case conservatively and does not overmatch similar messages', async () => {
    assert.strictEqual(KNOWN_CASES.length, 1);
    const knownCase = KNOWN_CASES[0];
    assert.ok(knownCase !== undefined);
    assert.deepStrictEqual(knownCase.analysis?.downstreams, [INTEROP_DOWNSTREAMS.NESSUNO]);
    assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.ok((knownCase.analysis?.finalActions?.length ?? 0) > 0);

    for (const message of [
      'The coordinator is not aware of another member, re-joining the group',
      'The coordinator is not aware of this member',
      'The coordinator is not available, re-joining the group',
    ]) {
      const { draft } = await execute('prod', { applicationMessage: message });
      assert.notStrictEqual(draft?.kind, 'KNOWN_CASE');
    }
  });
});
