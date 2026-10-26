import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ResultField } from '@go-automation/go-common/aws';

import { ConditionEvaluator, INTEROP_DOWNSTREAMS, type RunbookContext } from '../../framework.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { resolveOccurrenceTimeWindow } from '../../../computeRunbookTimeRange.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { DELEGATION_OUTBOUND_WRITER_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';
import { buildRunbook } from '../runbook.js';

const DOCUMENTED_MESSAGE =
  'ERROR - Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member';

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
    executionId: 'delegation-outbound-writer-test',
    startedAt: new Date('2026-09-21T14:14:33.822Z'),
    stepResults: new Map([[stepId, output]]),
    vars: new Map([['interopEnvironment', 'prod']]),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

describe('delegation outbound writer runbook', () => {
  const evaluator = new ConditionEvaluator();

  it('registers prod, att and test with environment-specific log groups', () => {
    assert.deepStrictEqual(alarm.alarmNames, [
      `${alarm.runbookKey}-prod`,
      `${alarm.runbookKey}-att`,
      `${alarm.runbookKey}-test`,
    ]);
    for (const environment of ['prod', 'att', 'test'] as const) {
      const name = `${alarm.runbookKey}-${environment}`;
      const registered = RUNBOOK_CATALOG.resolveByAlarmName(name);
      assert.ok(registered);
      assert.strictEqual(registered.descriptor.key, alarm.runbookKey);
      assert.strictEqual(registered.product, 'INTEROP');
      assert.strictEqual(registered.descriptor.kind, 'K8S');
      assert.strictEqual(alarm.resolveContext(name).environment, environment);
      assert.strictEqual(
        alarm.resolveContext(name).logGroup,
        `/aws/eks/interop-eks-cluster-${environment}/application`,
      );
      assert.strictEqual(alarm.resolveContext(name).podApp, alarm.podApp);
    }
    assert.throws(() => alarm.resolveContext(`${alarm.runbookKey}-dev`), /Unsupported INTEROP alarm/u);
  });

  it('builds the application log and CID pipeline with the source link', () => {
    const runbook = buildRunbook();
    assert.deepStrictEqual(
      runbook.steps.map(({ step }) => step.id),
      [
        alarm.stepIds.resolveContext,
        alarm.stepIds.queryApplicationLogs,
        alarm.stepIds.analyzeApplicationLogs,
        alarm.stepIds.queryCidTracker,
        'query-delegation-outbound-writer-context',
        alarm.stepIds.analyzeCidTracker,
      ],
    );
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(resolveOccurrenceTimeWindow(runbook), { beforeMinutes: 5, afterMinutes: 5 });
    assert.deepStrictEqual(runbook.analysisDefaults?.links, [
      {
        url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3375694080/k8s-interop-be-delegation-outbound-writer-errors',
        name: alarm.runbookKey,
        type: 'CONFLUENCE',
      },
    ]);
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(runbook.analysisDefaults?.resources, [
      { name: alarm.podApp, type: 'Service', role: 'PRIMARY' },
    ]);
  });

  it('recognizes heartbeat and rejoin in writer evidence, excluding other services in the CID tracker', () => {
    assert.strictEqual(KNOWN_CASES.length, 4);
    const knownCase = KNOWN_CASES[0];
    assert.ok(knownCase);
    assert.strictEqual(
      evaluator.evaluate(knownCase.condition, context(alarm.stepIds.queryApplicationLogs, rows(DOCUMENTED_MESSAGE))),
      true,
    );
    for (const message of [
      DOCUMENTED_MESSAGE.replace('version: 3', 'version: 4'),
      'ERROR - The coordinator is not aware of this member, re-joining the group',
    ])
      assert.strictEqual(
        evaluator.evaluate(knownCase.condition, context(alarm.stepIds.queryApplicationLogs, rows(message))),
        true,
      );
    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        context(alarm.stepIds.queryCidTracker, [
          { cid: 'cid-1', rows: rows(JSON.stringify({ log: DOCUMENTED_MESSAGE })) },
        ]),
      ),
      false,
    );
    for (const otherMessage of [
      'The coordinator is not aware of this member, re-joining the group',
      'ERROR - Response Heartbeat(key: 12, version: 3) - The coordinator is not available',
      'ERROR - Connection error: Client network socket disconnected before secure TLS connection was established',
    ]) {
      assert.strictEqual(
        evaluator.evaluate(knownCase.condition, context(alarm.stepIds.queryApplicationLogs, rows(otherMessage))),
        false,
      );
    }
  });

  it('keeps the unresolved cause open and links PIN-7325 for review', () => {
    const knownCase = KNOWN_CASES[0];
    assert.ok(knownCase);
    assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(knownCase.analysis?.analysisType, 'ANALYZABLE');
    assert.deepStrictEqual(knownCase.analysis?.downstreams, [INTEROP_DOWNSTREAMS.NESSUNO]);
    assert.deepStrictEqual(knownCase.analysis?.links, [
      { url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' },
    ]);
    for (const candidate of KNOWN_CASES) {
      assert.strictEqual(candidate.analysis?.proposedStatus, 'IN_PROGRESS');
    }
  });
});
