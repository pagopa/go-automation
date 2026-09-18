import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ResultField } from '@go-automation/go-common/aws';
import { ConditionEvaluator, INTEROP_DOWNSTREAMS, service, type RunbookContext } from '../../framework.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { AUTHORIZATION_PROCESS_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';
import { buildRunbook } from '../runbook.js';

const FIXTURES = new Map<string, string>([
  [
    'authorization-process-connection-terminated-by-administrator',
    'ERROR - Error uncaughtException intercepted; Error detail: error: terminating connection due to administrator command',
  ],
  ['authorization-process-closed-connection-while-sending', 'Failed to send messages: Closed connection'],
  ['authorization-process-kafka-lock-timeout', 'KafkaJSLockTimeout: Timeout while acquiring lock'],
  [
    'authorization-process-clients-with-keys-unauthorized',
    'GET http://interop-be-authorization-process.prod.svc.cluster.local:8088/clientsWithKeys 401:Unauthorized. Error getting public key.',
  ],
  [
    'authorization-process-duplicate-event-stream-version',
    'Error creating event: error: duplicate key value violates unique constraint "events_stream_id_version_key"',
  ],
]);

function rows(messages: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<ResultField>> {
  return messages.map((message) => [
    { field: '@timestamp', value: '2026-09-08 15:31:00.000' },
    { field: 'pod_app', value: alarm.podApp },
    { field: '@message', value: message },
  ]);
}

function context(stepId: string, output: unknown): RunbookContext {
  return {
    executionId: 'authorization-process-test',
    startedAt: new Date('2026-09-08T15:31:00.000Z'),
    stepResults: new Map([[stepId, output]]),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

describe('authorization-process runbook', () => {
  const evaluator = new ConditionEvaluator();

  it('registers only the production alarm documented by Confluence', () => {
    assert.deepStrictEqual(alarm.alarmNames, ['k8s-interop-be-authorization-process-errors-prod']);
    assert.strictEqual(
      RUNBOOK_CATALOG.resolveByAlarmName('k8s-interop-be-authorization-process-errors-prod')?.descriptor.key,
      alarm.runbookKey,
    );
    assert.strictEqual(alarm.resolveContext(alarm.alarmNames[0]).environment, 'prod');
    assert.strictEqual(
      alarm.resolveContext(alarm.alarmNames[0]).logGroup,
      '/aws/eks/interop-eks-cluster-prod/application',
    );
    for (const name of [
      'k8s-interop-be-authorization-process-errors-att',
      'k8s-interop-be-authorization-process-errors-test',
      'k8s-interop-be-authorization-process-errors-dev',
    ]) {
      assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName(name), undefined);
      assert.throws(() => alarm.resolveContext(name), /Unsupported INTEROP alarm/);
    }
  });

  it('builds the standard read-only application-log and CID pipeline with the documented window', () => {
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
      'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2764898487/k8s-interop-be-authorization-process-errors',
    );
  });

  it('declares and recognizes all five documented cases in application logs', () => {
    assert.strictEqual(KNOWN_CASES.length, 5);
    assert.strictEqual(new Set(KNOWN_CASES.map(({ id }) => id)).size, 5);
    assert.strictEqual(new Set(KNOWN_CASES.map(({ priority }) => priority)).size, 5);

    for (const knownCase of KNOWN_CASES) {
      const fixture = FIXTURES.get(knownCase.id);
      assert.ok(fixture !== undefined, `missing fixture for ${knownCase.id}`);
      assert.strictEqual(
        evaluator.evaluate(knownCase.condition, context(alarm.stepIds.queryApplicationLogs, rows([fixture]))),
        true,
        knownCase.id,
      );
      assert.deepStrictEqual(knownCase.analysis?.downstreams, [INTEROP_DOWNSTREAMS.NESSUNO]);
    }
  });

  it('recognizes documented evidence from JSON-encoded CID tracker logs', () => {
    for (const knownCase of KNOWN_CASES) {
      const fixture = FIXTURES.get(knownCase.id);
      assert.ok(fixture !== undefined);
      const output = [{ cid: 'cid-1', rows: rows([JSON.stringify({ log: fixture })]) }];
      assert.strictEqual(
        evaluator.evaluate(knownCase.condition, context(alarm.stepIds.queryCidTracker, output)),
        true,
        knownCase.id,
      );
    }
  });

  it('closes only the non-impacting duplicate handled by retry', () => {
    const completed = KNOWN_CASES.filter(({ analysis }) => analysis?.proposedStatus === 'COMPLETED');
    assert.deepStrictEqual(
      completed.map(({ id }) => id),
      ['authorization-process-duplicate-event-stream-version'],
    );
    for (const knownCase of KNOWN_CASES.filter(({ analysis }) => analysis?.proposedStatus === 'IN_PROGRESS')) {
      assert.ok((knownCase.analysis?.finalActions?.length ?? 0) > 0);
      assert.ok(knownCase.priority > (completed[0]?.priority ?? 0));
    }
  });

  it('does not broaden the known cases to generic connection, Kafka, 401 or duplicate errors', () => {
    const unknowns = rows([
      'terminating connection because the client disconnected',
      'Failed to send messages: Permission denied',
      'KafkaJSConnectionError: Connection error',
      'GET /clientsWithKeys 500:Internal Server Error. Error getting public key.',
      'GET /otherEndpoint 401:Unauthorized. Error getting public key.',
      'duplicate key value violates unique constraint "another_constraint"',
    ]);
    const ctx = context(alarm.stepIds.queryApplicationLogs, unknowns);
    for (const knownCase of KNOWN_CASES) {
      assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), false, knownCase.id);
    }
  });

  it('keeps actionable evidence primary when the retry-managed duplicate is also present', () => {
    const ctx = context(alarm.stepIds.queryApplicationLogs, [
      ...rows([FIXTURES.get('authorization-process-kafka-lock-timeout') ?? '']),
      ...rows([FIXTURES.get('authorization-process-duplicate-event-stream-version') ?? '']),
    ]);
    const matches = KNOWN_CASES.filter(({ condition }) => evaluator.evaluate(condition, ctx)).sort(
      (left, right) => right.priority - left.priority,
    );
    assert.deepStrictEqual(
      matches.map(({ id }) => id),
      ['authorization-process-kafka-lock-timeout', 'authorization-process-duplicate-event-stream-version'],
    );
  });
});
