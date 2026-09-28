import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CATALOG_PLATFORMSTATE_WRITER_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';
import { buildRunbook } from '../runbook.js';
import { ConditionEvaluator, INTEROP_DOWNSTREAMS, type RunbookContext } from '../../framework.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { resolveOccurrenceTimeWindow } from '../../../computeRunbookTimeRange.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';

const DOCUMENTED_NETWORK_MESSAGES = [
  'ERROR - Connection timeout',
  'ERROR -  Connection error: Client network socket disconnected before secure TLS connection was established',
];

const DOCUMENTED_KAFKA_MESSAGES = [
  'Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member',
  'The coordinator is not aware of this member, re-joining the group - The coordinator is not aware of this member',
];

function context(stepId: string, message: string, cidTracker = false): RunbookContext {
  const rows = [
    [
      { field: '@message', value: message },
      { field: 'pod_app', value: alarm.podApp },
    ],
  ];
  return {
    executionId: 'test',
    startedAt: new Date('2026-09-21T14:11:00Z'),
    stepResults: new Map([[stepId, cidTracker ? [{ cid: 'cid-1', rows }] : rows]]),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

describe('catalog platformstate writer alarm', () => {
  it('registers all three documented environments with their own application log group', () => {
    const expected = [
      'k8s-interop-be-catalog-platformstate-writer-errors-prod',
      'k8s-interop-be-catalog-platformstate-writer-errors-att',
      'k8s-interop-be-catalog-platformstate-writer-errors-test',
    ];
    assert.deepStrictEqual(alarm.alarmNames, expected);
    for (const alarmName of expected) {
      const resolved = RUNBOOK_CATALOG.resolveByAlarmName(alarmName);
      assert.ok(resolved);
      assert.strictEqual(resolved.descriptor.key, alarm.runbookKey);
      assert.strictEqual(resolved.product, 'INTEROP');
      assert.strictEqual(resolved.descriptor.kind, 'K8S');
      assert.deepStrictEqual(resolved.descriptor.categories, ['INTEROP']);
      const alarmContext = alarm.resolveContext(alarmName);
      assert.strictEqual(alarmContext.podApp, alarm.podApp);
      assert.strictEqual(alarmContext.logGroup, `/aws/eks/interop-eks-cluster-${alarmContext.environment}/application`);
    }
    assert.throws(() => alarm.resolveContext(`${alarm.runbookKey}-dev`), /Unsupported INTEROP alarm name/u);
  });

  it('builds the read-only application log and CID pipeline with the source link', () => {
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
    assert.deepStrictEqual(runbook.analysisDefaults?.resources, [{ name: alarm.podApp, role: 'PRIMARY' }]);
    assert.deepStrictEqual(runbook.analysisDefaults?.links, [
      {
        url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3298033847/k8s-interop-be-catalog-platformstate-writer-errors',
        name: alarm.runbookKey,
        type: 'CONFLUENCE',
      },
    ]);
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
  });

  it('recognizes every documented network and Kafka signature in application logs or CID evidence', () => {
    const evaluator = new ConditionEvaluator();
    assert.strictEqual(KNOWN_CASES.length, 2);
    const [network, kafka] = KNOWN_CASES;
    assert.ok(network);
    assert.ok(kafka);

    for (const stepId of [alarm.stepIds.queryApplicationLogs, alarm.stepIds.queryCidTracker]) {
      const cidTracker = stepId === alarm.stepIds.queryCidTracker;
      for (const message of DOCUMENTED_NETWORK_MESSAGES) {
        assert.strictEqual(evaluator.evaluate(network.condition, context(stepId, message, cidTracker)), true, message);
        assert.strictEqual(evaluator.evaluate(kafka.condition, context(stepId, message, cidTracker)), false, message);
      }
      for (const message of DOCUMENTED_KAFKA_MESSAGES) {
        assert.strictEqual(evaluator.evaluate(kafka.condition, context(stepId, message, cidTracker)), true, message);
        assert.strictEqual(evaluator.evaluate(network.condition, context(stepId, message, cidTracker)), false, message);
      }
    }
    const unrelated = context(alarm.stepIds.queryApplicationLogs, 'The group coordinator is not available');
    assert.strictEqual(evaluator.evaluate(network.condition, unrelated), false);
    assert.strictEqual(evaluator.evaluate(kafka.condition, unrelated), false);
  });

  it('keeps unresolved cases open and links the Kafka hotfix', () => {
    for (const knownCase of KNOWN_CASES) {
      assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
      assert.deepStrictEqual(knownCase.analysis?.downstreams, [INTEROP_DOWNSTREAMS.NESSUNO]);
    }
    assert.deepStrictEqual(KNOWN_CASES[1]?.analysis?.links, [
      { url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' },
    ]);
  });
});
