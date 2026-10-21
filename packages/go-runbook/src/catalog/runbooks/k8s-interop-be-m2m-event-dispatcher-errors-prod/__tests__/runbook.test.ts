import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConditionEvaluator, type RunbookContext } from '../../framework.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { M2M_EVENT_DISPATCHER_ALARM as ALARM } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';
import { M2M_EVENT_DISPATCHER_REGISTRATION } from '../registration.js';
import { buildRunbook } from '../runbook.js';

function context(messages: ReadonlyArray<string>, stepId = ALARM.stepIds.queryApplicationLogs): RunbookContext {
  return {
    executionId: 'm2m-test',
    startedAt: new Date('2026-10-06T17:28:13Z'),
    stepResults: new Map([[stepId, messages.map((message) => [{ field: '@message', value: message }])]]),
    vars: new Map([
      ['interopPodApp', ALARM.podApp],
      ['interopLogGroup', '/aws/eks/interop-eks-cluster-prod/application'],
      ['interopEnvironment', 'prod'],
    ]),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

describe('M2M event dispatcher production runbook', () => {
  it('registers only the verified production alarm and resolves the real log group', () => {
    assert.deepStrictEqual(M2M_EVENT_DISPATCHER_REGISTRATION.alarmNames, [ALARM.runbookKey]);
    assert.strictEqual(M2M_EVENT_DISPATCHER_REGISTRATION.kind, 'K8S');
    assert.strictEqual(M2M_EVENT_DISPATCHER_REGISTRATION.product, 'INTEROP');
    assert.strictEqual(
      ALARM.resolveContext(ALARM.runbookKey).logGroup,
      '/aws/eks/interop-eks-cluster-prod/application',
    );
    for (const suffix of ['test', 'att', 'dev']) {
      assert.throws(() => ALARM.resolveContext(ALARM.runbookKey.replace(/prod$/u, suffix)), /Unsupported/u);
    }
  });

  it('builds a cloud executable read-only pipeline with production query and Confluence reference', () => {
    const runbook = buildRunbook();
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.strictEqual(runbook.steps.length, 5);
    const step = runbook.steps.find(({ step }) => step.id === ALARM.stepIds.queryApplicationLogs)?.step;
    const trace = step?.getTraceInfo?.(context([]));
    assert.ok(trace);
    assert.match(String(trace['query']), /filter pod_namespace = "prod"/u);
    assert.ok(String(trace['query']).includes(ALARM.podApp.replaceAll('-', '\\-')));
    assert.deepStrictEqual(trace['logGroups'], ['/aws/eks/interop-eks-cluster-prod/application']);
    assert.strictEqual(runbook.analysisDefaults?.links?.[0]?.type, 'CONFLUENCE');
    assert.match(runbook.analysisDefaults?.links?.[0]?.url ?? '', /2590736537/u);
  });

  it('recognizes both documented connection signatures and the documented member error', () => {
    const evaluator = new ConditionEvaluator();
    const fixtures = [
      ['m2m-connection-timeout-tls', 'ERROR - Connection timeout'],
      [
        'm2m-connection-timeout-tls',
        'ERROR - Connection error: Client network socket disconnected before secure TLS connection was established',
      ],
      ['m2m-member-rejoin', 'Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member'],
    ];
    for (const [id, message] of fixtures) {
      const knownCase = KNOWN_CASES.find((candidate) => candidate.id === id);
      assert.ok(knownCase && message);
      assert.strictEqual(evaluator.evaluate(knownCase.condition, context([message])), true);
    }
  });

  it('recognizes the actual incident signatures and prioritizes the crash over connection failures', () => {
    const evaluator = new ConditionEvaluator();
    const messages = [
      'ERROR - Connection error: connect ECONNREFUSED broker:9098',
      'ERROR - Crash: KafkaJSNumberOfRetriesExceeded: Connection error: connect ECONNREFUSED broker:9098',
      'ERROR - Error Consumer crashed {"type":"consumer.crash","payload":{"restart":false}}.',
      'ERROR - Response Heartbeat(key: 12, version: 3) - This is not the correct coordinator for this group',
    ];
    const matched = KNOWN_CASES.filter((candidate) => evaluator.evaluate(candidate.condition, context(messages)));
    assert.deepStrictEqual(
      matched.map((candidate) => candidate.id),
      ['m2m-consumer-crash', 'm2m-connection-refused', 'm2m-wrong-coordinator'],
    );
    assert.ok(matched[0] && matched[1] && matched[0].priority > matched[1].priority);
  });

  it('recognizes JSON encoded evidence and keeps every conditional recovery open', () => {
    const evaluator = new ConditionEvaluator();
    const member = KNOWN_CASES.find((candidate) => candidate.id === 'm2m-member-rejoin');
    assert.ok(member);
    assert.strictEqual(
      evaluator.evaluate(
        member.condition,
        context(
          [JSON.stringify({ log: 'The coordinator is not aware of this member' })],
          ALARM.stepIds.queryCidTracker,
        ),
      ),
      true,
    );
    for (const knownCase of KNOWN_CASES) {
      assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
      assert.strictEqual(knownCase.analysis?.analysisType, 'ANALYZABLE');
      assert.strictEqual(knownCase.analysis?.ignoreReasonCode, undefined);
    }
  });

  it('does not infer a known case or maintenance from empty logs, tokens or unrelated errors', () => {
    const evaluator = new ConditionEvaluator();
    for (const messages of [
      [],
      ['AWS authentication token obtained', 'Request timeout', 'AccessDenied', 'MSK Kafka security patching'],
    ]) {
      for (const knownCase of KNOWN_CASES) {
        assert.strictEqual(evaluator.evaluate(knownCase.condition, context(messages)), false, knownCase.id);
      }
    }
  });
});
