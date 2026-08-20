import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConditionEvaluator, type KnownCase, type RunbookContext, type ServiceRegistry } from '../../framework.js';

import { KNOWN_CASES } from '../knownCases.js';
import { INTEROP_NOTIFICATION_USER_LIFECYCLE_SERVICE_NAME } from '../resolveInteropAlarmContext.js';
import { QUERY_INTEROP_APPLICATION_LOGS_STEP_ID, QUERY_INTEROP_CID_TRACKER_STEP_ID } from '../runbookSteps.js';

interface LogRowField {
  readonly field: string;
  readonly value: string;
}

const CASE_FIXTURES: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  ['notification-kafka-broker-communication-errors', ['ERROR - Connection error: read ECONNRESET']],
  [
    'notification-duplicate-event-stream-version',
    ['Error creating event: error: duplicate key value violates unique constraint "events_stream_id_version_key"'],
  ],
  ['notification-certifier-tenant-istat-not-found', ['Message: Certifier tenant ISTAT not found']],
]);

function applicationLogRows(messages: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<LogRowField>> {
  return messages.map((message) => [
    { field: '@timestamp', value: '2026-07-15 10:00:00.000' },
    { field: 'pod_app', value: INTEROP_NOTIFICATION_USER_LIFECYCLE_SERVICE_NAME },
    { field: '@message', value: message },
  ]);
}

function context(stepResults: ReadonlyArray<readonly [string, unknown]>): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-07-15T10:00:00.000Z'),
    stepResults: new Map<string, unknown>(stepResults),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

function knownCaseById(id: string): KnownCase {
  const knownCase = KNOWN_CASES.find((candidate) => candidate.id === id);
  assert.ok(knownCase !== undefined, `known case not found: ${id}`);
  return knownCase;
}

describe('INTEROP notification user lifecycle known cases', () => {
  const evaluator = new ConditionEvaluator();

  it('has unique IDs and priorities', () => {
    assert.strictEqual(new Set(KNOWN_CASES.map((knownCase) => knownCase.id)).size, KNOWN_CASES.length);
    assert.strictEqual(new Set(KNOWN_CASES.map((knownCase) => knownCase.priority)).size, KNOWN_CASES.length);
  });

  it('matches every documented known case against application logs', () => {
    for (const knownCase of KNOWN_CASES) {
      const fixture = CASE_FIXTURES.get(knownCase.id);
      assert.ok(fixture !== undefined, `missing fixture for known case: ${knownCase.id}`);
      const ctx = context([[QUERY_INTEROP_APPLICATION_LOGS_STEP_ID, applicationLogRows(fixture)]]);
      assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true, `expected match: ${knownCase.id}`);
    }
  });

  it('matches the KafkaJS retry exhaustion variant in CID tracker evidence', () => {
    const knownCase = knownCaseById('notification-kafka-broker-communication-errors');
    const rows = applicationLogRows([
      'ERROR - Crash: KafkaJSNumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
    ]);
    const ctx = context([[QUERY_INTEROP_CID_TRACKER_STEP_ID, [{ cid: 'cid-1', rows }]]]);
    assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true);
  });

  it('does not classify a generic connection reset or duplicate-key error', () => {
    const kafka = knownCaseById('notification-kafka-broker-communication-errors');
    const duplicate = knownCaseById('notification-duplicate-event-stream-version');
    const ctx = context([
      [
        QUERY_INTEROP_APPLICATION_LOGS_STEP_ID,
        applicationLogRows([
          'Request failed: read ECONNRESET',
          'duplicate key value violates unique constraint "another_constraint"',
        ]),
      ],
    ]);
    assert.strictEqual(evaluator.evaluate(kafka.condition, ctx), false);
    assert.strictEqual(evaluator.evaluate(duplicate.condition, ctx), false);
  });
});
