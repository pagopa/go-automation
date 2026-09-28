import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ResultField } from '@go-automation/go-common/aws';

import { ConditionEvaluator, INTEROP_DOWNSTREAMS, type RunbookContext } from '../../framework.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { resolveOccurrenceTimeWindow } from '../../../computeRunbookTimeRange.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { TENANT_READMODEL_WRITER_SQL_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';
import { buildRunbook } from '../runbook.js';

const DOCUMENTED_MESSAGE =
  'ERROR - Connection error: Client network socket disconnected before secure TLS connection was established';

function rows(message: string): ReadonlyArray<ReadonlyArray<ResultField>> {
  return [
    [
      { field: 'pod_app', value: alarm.podApp },
      { field: '@message', value: message },
    ],
  ];
}

function context(stepId: string, output: unknown): RunbookContext {
  return {
    executionId: 'tenant-readmodel-writer-test',
    startedAt: new Date('2026-09-21T14:20:34.111Z'),
    stepResults: new Map([[stepId, output]]),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

describe('tenant readmodel writer SQL runbook', () => {
  const evaluator = new ConditionEvaluator();

  it('registers only the documented production alarm', () => {
    const prod = `${alarm.runbookKey}-prod`;
    assert.deepStrictEqual(alarm.alarmNames, [prod]);
    const registered = RUNBOOK_CATALOG.resolveByAlarmName(prod);
    assert.ok(registered);
    assert.strictEqual(registered.descriptor.key, alarm.runbookKey);
    assert.strictEqual(registered.product, 'INTEROP');
    assert.strictEqual(registered.descriptor.kind, 'K8S');
    assert.strictEqual(alarm.resolveContext(prod).logGroup, '/aws/eks/interop-eks-cluster-prod/application');
    assert.strictEqual(alarm.resolveContext(prod).podApp, alarm.podApp);
    for (const environment of ['att', 'test', 'dev']) {
      const name = `${alarm.runbookKey}-${environment}`;
      assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName(name), undefined);
      assert.throws(() => alarm.resolveContext(name), /Unsupported INTEROP alarm/u);
    }
  });

  it('builds the application log and CID pipeline with the documented source', () => {
    const runbook = buildRunbook();
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
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(resolveOccurrenceTimeWindow(runbook), { beforeMinutes: 5, afterMinutes: 5 });
    assert.deepStrictEqual(runbook.analysisDefaults?.links, [
      {
        url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2500296801/k8s-interop-be-tenant-readmodel-writer-sql-errors-prod',
        name: alarm.runbookKey,
        type: 'CONFLUENCE',
      },
    ]);
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
  });

  it('matches the documented Kafka TLS error in application logs and CID tracker evidence', () => {
    assert.strictEqual(KNOWN_CASES.length, 1);
    const knownCase = KNOWN_CASES[0];
    assert.ok(knownCase);
    assert.strictEqual(
      evaluator.evaluate(knownCase.condition, context(alarm.stepIds.queryApplicationLogs, rows(DOCUMENTED_MESSAGE))),
      true,
    );
    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        context(alarm.stepIds.queryCidTracker, [
          { cid: 'cid-1', rows: rows(JSON.stringify({ log: DOCUMENTED_MESSAGE })) },
        ]),
      ),
      true,
    );
    for (const otherMessage of [
      'ERROR - Connection timeout',
      'ERROR - Connection error: Connection refused',
      'Request failed: Client network socket disconnected before secure TLS connection was established',
    ]) {
      assert.strictEqual(
        evaluator.evaluate(knownCase.condition, context(alarm.stepIds.queryApplicationLogs, rows(otherMessage))),
        false,
      );
    }
  });

  it('keeps the unresolved case open and links the documented hotfix', () => {
    const knownCase = KNOWN_CASES[0];
    assert.ok(knownCase);
    assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(knownCase.analysis?.analysisType, 'ANALYZABLE');
    assert.deepStrictEqual(knownCase.analysis?.downstreams, [INTEROP_DOWNSTREAMS.NESSUNO]);
    assert.deepStrictEqual(knownCase.analysis?.links, [
      { url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' },
    ]);
  });
});
