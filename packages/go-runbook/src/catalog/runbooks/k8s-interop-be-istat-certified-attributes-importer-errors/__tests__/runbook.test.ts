import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOLogger } from '@go-automation/go-common/core';
import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { resolveOccurrenceTimeWindow } from '../../../computeRunbookTimeRange.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { INTEROP_DOWNSTREAMS } from '../../framework.js';
import type { InteropEnvironment } from '../../interop/InteropEnvironment.js';
import { ISTAT_IMPORTER_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';
import { KNOWN_CASES } from '../knownCases.js';

// Real message shapes from Confluence v7 and the PIN-10543 comments.
const DUPLICATE =
  'Certified Discrete Attribute 91387efa-8661-4ca7-a15e-888baab89bf6 already assigned to tenant 2cc6f822-63a8-418b-bcda-7ea389bf3d28';
const CONFLICT = 'Error on internalAssignDiscreteCertifiedAttribute. Reason: Request failed with status code 409';
const TENANT = 'Certifier tenant ISTAT not found';

interface Scenario {
  readonly environment: InteropEnvironment;
  readonly applicationMessage: string;
  readonly cid?: string;
  readonly trackerMessage?: string;
}

async function execute(scenario: Scenario): Promise<{
  result: RunbookExecutionResult;
  draft: ReturnType<typeof buildAnalysisDraft>;
  queries: ReadonlyArray<string>;
  logGroups: ReadonlyArray<string>;
}> {
  const queries: string[] = [];
  const logGroups: string[] = [];
  const cloudWatchLogs = {
    async queryWithStatistics(groups: ReadonlyArray<string>, query: string): Promise<AWSCloudWatchLogsQueryResult> {
      await Promise.resolve();
      queries.push(query);
      logGroups.push(...groups);
      const tracker = query.includes('filter cid =');
      const message = tracker ? scenario.trackerMessage : scenario.applicationMessage;
      const rows: ReadonlyArray<ReadonlyArray<ResultField>> =
        message === undefined
          ? []
          : [
              [
                { field: '@timestamp', value: '2026-09-17 10:00:00.000' },
                { field: 'pod_app', value: tracker ? 'interop-be-tenant-process' : alarm.podApp },
                { field: '@message', value: JSON.stringify({ log: message }) },
                ...(scenario.cid === undefined ? [] : [{ field: 'cid', value: scenario.cid }]),
              ],
            ];
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
      ['alarmName', `${alarm.runbookKey}-${scenario.environment}`],
      ['startTime', '2026-09-17T09:55:00.000Z'],
      ['endTime', '2026-09-17T10:05:00.000Z'],
    ]),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
  return { result, draft: buildAnalysisDraft(runbook, result), queries, logGroups };
}

describe('ISTAT certified attributes importer runbook', () => {
  it('registers exactly prod, att and test with the environment-specific log group', () => {
    const descriptor = RUNBOOK_CATALOG.resolveByKey(alarm.runbookKey)?.descriptor;
    assert.ok(descriptor !== undefined);
    assert.deepStrictEqual(
      descriptor.alarmNames,
      ['att', 'prod', 'test'].map((env) => `${alarm.runbookKey}-${env}`),
    );
    for (const env of ['prod', 'att', 'test']) {
      const name = `${alarm.runbookKey}-${env}`;
      assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName(name)?.descriptor.key, alarm.runbookKey);
      assert.strictEqual(alarm.resolveContext(name).environment, env);
      assert.strictEqual(alarm.resolveContext(name).logGroup, `/aws/eks/interop-eks-cluster-${env}/application`);
    }
    assert.throws(() => alarm.resolveContext(`${alarm.runbookKey}-dev`), /Unsupported INTEROP alarm/);
    assert.throws(
      () => alarm.resolveContext('k8s-interop-be-notification-user-lifecycle-consumer-errors-prod'),
      /Unsupported INTEROP alarm/,
    );
  });

  it('uses the standard read-only pipeline, source link and default diagnostic window', () => {
    const runbook = buildRunbook();
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
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
    assert.deepStrictEqual(resolveOccurrenceTimeWindow(runbook), { beforeMinutes: 5, afterMinutes: 5 });
    assert.strictEqual(
      runbook.analysisDefaults?.links?.[0]?.url,
      'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3197961176/k8s-interop-be-istat-certified-attributes-importer-errors',
    );
    assert.strictEqual(KNOWN_CASES.length, 2);
    assert.strictEqual(new Set(KNOWN_CASES.map((item) => item.id)).size, 2);
    assert.strictEqual(new Set(KNOWN_CASES.map((item) => item.priority)).size, 2);
    for (const item of KNOWN_CASES) {
      assert.deepStrictEqual(item.analysis?.downstreams, [INTEROP_DOWNSTREAMS.NESSUNO]);
      assert.strictEqual(item.analysis?.proposedStatus, 'IN_PROGRESS');
      assert.ok((item.analysis?.finalActions?.length ?? 0) > 0);
    }
  });

  for (const environment of ['prod', 'att', 'test'] as const) {
    for (const message of [DUPLICATE, CONFLICT, TENANT]) {
      it(`recognizes ${message.slice(0, 35)} in ${environment}, even without a CID`, async () => {
        const { result, draft, queries, logGroups } = await execute({ environment, applicationMessage: message });
        assert.strictEqual(
          result.matchedCases[0]?.id,
          message === TENANT
            ? 'istat-certifier-tenant-not-found'
            : 'istat-discrete-certified-attribute-already-assigned',
        );
        assert.strictEqual(draft?.kind, 'KNOWN_CASE');
        assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
        assert.deepStrictEqual(logGroups, [`/aws/eks/interop-eks-cluster-${environment}/application`]);
        assert.match(queries[0] ?? '', /ERROR.*stderr/u);
        assert.match(queries[0] ?? '', /not like \/adot-collector\//u);
        assert.ok(queries[0]?.includes('pod_app like /interop\\-be\\-istat\\-certified\\-attributes\\-importer/'));
      });
    }

    it(`follows the CID into correlated services in ${environment}`, async () => {
      const { result, queries, logGroups } = await execute({
        environment,
        applicationMessage: 'Request failed',
        cid: 'istat-cid',
        trackerMessage: DUPLICATE,
      });
      assert.strictEqual(result.matchedCases[0]?.id, 'istat-discrete-certified-attribute-already-assigned');
      assert.strictEqual(queries.length, 2);
      assert.match(queries[1] ?? '', /filter cid = "istat-cid"/u);
      assert.deepStrictEqual(
        logGroups,
        Array<string>(2).fill(`/aws/eks/interop-eks-cluster-${environment}/application`),
      );
    });
  }

  it('does not classify unrelated 409s, failed assignments with another status, or another certifier', async () => {
    for (const message of [
      'Request failed with status code 409',
      CONFLICT.replace('409', '500'),
      CONFLICT.replace('409', '4090'),
      TENANT.replace('ISTAT', 'ANAC'),
    ]) {
      const { result, draft } = await execute({ environment: 'prod', applicationMessage: message });
      assert.deepStrictEqual(result.matchedCases, []);
      assert.notStrictEqual(draft?.kind, 'KNOWN_CASE');
    }
  });

  it('keeps a missing certifier primary when a handled duplicate is also present', async () => {
    const { result, draft } = await execute({
      environment: 'test',
      applicationMessage: CONFLICT,
      cid: 'istat-cid',
      trackerMessage: TENANT,
    });
    assert.deepStrictEqual(
      result.matchedCases.map((item) => item.id),
      ['istat-certifier-tenant-not-found', 'istat-discrete-certified-attribute-already-assigned'],
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
  });

  it('links the 409 to its actual logging fix instead of treating October 1 as deployment proof', async () => {
    const { draft } = await execute({ environment: 'prod', applicationMessage: CONFLICT });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.match(draft.conclusionNotes, /PIN-10823/u);
    assert.match(draft.conclusionNotes, /ERROR a WARN/u);
    assert.match(draft.conclusionNotes, /versione installata/u);
    assert.ok(
      KNOWN_CASES.find(
        (item) => item.id === 'istat-discrete-certified-attribute-already-assigned',
      )?.analysis?.links?.some((link) => link.name === 'PIN-10823'),
    );
  });
});
