import { NOTIFICATION_USER_LIFECYCLE_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConditionEvaluator, INTEROP_DOWNSTREAMS, type KnownCase, type RunbookContext } from '../../framework.js';

import { KNOWN_CASES } from '../knownCases.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';

interface LogRowField {
  readonly field: string;
  readonly value: string;
}

const CASE_FIXTURES: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  ['notification-kafka-no-broker', ['ERROR - Crash: KafkaJSNoBrokerAvailableError: No broker available']],
  [
    'notification-kafka-metadata-timeout',
    ['ERROR - Crash: KafkaJSNumberOfRetriesExceeded: Request Metadata(key: 3, version: 6) timed out'],
  ],
  [
    'notification-kafka-replica-retries-exhausted',
    ['ERROR - Crash: KafkaJSNumberOfRetriesExceeded: The replica is not available for the requested topic-partition'],
  ],
  ['notification-kafka-broker-communication-errors', ['ERROR - Connection error: read ECONNRESET']],
  ['notification-kafka-read-timeout', ['ERROR - Connection error: read ETIMEDOUT']],
  [
    'notification-duplicate-event-stream-version',
    ['Error creating event: error: duplicate key value violates unique constraint "events_stream_id_version_key"'],
  ],
  ['notification-certifier-tenant-istat-not-found', ['Message: Certifier tenant ISTAT not found']],
  [
    'notification-remove-api-role-conflict',
    [
      'Error handling Kafka message. Topic: sc-users. Reason: Error removing role api from notification config for user <user> in tenant <tenant>. Reason: AxiosError: Request failed with status code 409',
    ],
  ],
  [
    'notification-selfcare-tenant-not-found',
    [
      'Error handling Kafka message. Topic: sc-users. Partition number: 0. Offset: 1. Message: Error consuming message. Reason: Error: Tenant not found for selfcareId: <uuid>',
    ],
  ],
]);

function applicationLogRows(messages: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<LogRowField>> {
  return messages.map((message) => [
    { field: '@timestamp', value: '2026-07-15 10:00:00.000' },
    { field: 'pod_app', value: NOTIFICATION_USER_LIFECYCLE_ALARM.podApp },
    { field: '@message', value: message },
  ]);
}

function context(stepResults: ReadonlyArray<readonly [string, unknown]>, environment: string = 'prod'): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-07-15T10:00:00.000Z'),
    stepResults: new Map<string, unknown>(stepResults),
    vars: new Map([['interopEnvironment', environment]]),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
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

  it('keeps observed Kafka connection failures separate from the Selfcare timeout', () => {
    const knownCase = knownCaseById('notification-kafka-broker-communication-errors');
    const messages = [
      'Connection error: read ECONNRESET',
      'Connection error: Client network socket disconnected before secure TLS connection was established',
      'The group coordinator is not available',
    ];

    assert.deepStrictEqual(knownCase.analysis?.downstreams, [INTEROP_DOWNSTREAMS.NESSUNO]);
    for (const message of messages) {
      const ctx = context([
        [NOTIFICATION_USER_LIFECYCLE_ALARM.stepIds.queryApplicationLogs, applicationLogRows([message])],
      ]);
      assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true, `expected match: ${message}`);
    }
  });

  it('matches every documented known case against application logs', () => {
    for (const knownCase of KNOWN_CASES) {
      const fixture = CASE_FIXTURES.get(knownCase.id);
      assert.ok(fixture !== undefined, `missing fixture for known case: ${knownCase.id}`);
      const ctx = context([
        [NOTIFICATION_USER_LIFECYCLE_ALARM.stepIds.queryApplicationLogs, applicationLogRows(fixture)],
      ]);
      assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true, `expected match: ${knownCase.id}`);
    }
  });

  it('does not classify Kafka failures found only in CID tracker evidence', () => {
    const knownCase = knownCaseById('notification-kafka-broker-communication-errors');
    const rows = applicationLogRows([
      'ERROR - Crash: KafkaJSNumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
    ]);
    const ctx = context([[NOTIFICATION_USER_LIFECYCLE_ALARM.stepIds.queryCidTracker, [{ cid: 'cid-1', rows }]]]);
    assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), false);
  });

  it('does not close the case from a duplicate-event signature found only in CID tracker evidence', () => {
    const knownCase = knownCaseById('notification-duplicate-event-stream-version');
    const rawMessage = JSON.stringify({
      log: 'Error creating event: error: duplicate key value violates unique constraint "events_stream_id_version_key"',
    });
    const rows = applicationLogRows([rawMessage]);
    const ctx = context([[NOTIFICATION_USER_LIFECYCLE_ALARM.stepIds.queryCidTracker, [{ cid: 'cid-1', rows }]]]);

    assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), false);
  });

  it('recognizes JSON-encoded application errors while keeping tracker errors from other services out', () => {
    const messages = [...CASE_FIXTURES.values()].flat();
    for (const knownCase of KNOWN_CASES) {
      const fixture = CASE_FIXTURES.get(knownCase.id);
      assert.ok(fixture);
      assert.strictEqual(
        evaluator.evaluate(
          knownCase.condition,
          context([
            [
              NOTIFICATION_USER_LIFECYCLE_ALARM.stepIds.queryApplicationLogs,
              applicationLogRows(fixture.map((log) => JSON.stringify({ log }))),
            ],
          ]),
        ),
        true,
        knownCase.id,
      );
      const rows = applicationLogRows(messages).map((row) =>
        row.map((field) => (field.field === 'pod_app' ? { ...field, value: 'interop-be-another-service' } : field)),
      );
      assert.strictEqual(
        evaluator.evaluate(
          knownCase.condition,
          context([
            [
              NOTIFICATION_USER_LIFECYCLE_ALARM.stepIds.queryApplicationLogs,
              applicationLogRows(['ERROR - Unknown failure']),
            ],
            [NOTIFICATION_USER_LIFECYCLE_ALARM.stepIds.queryCidTracker, [{ cid: 'shared', rows }]],
          ]),
        ),
        false,
        knownCase.id,
      );
    }
  });

  it('retains PIN-7325 only for the documented replica failure and preserves documented no-action cases', () => {
    for (const knownCase of KNOWN_CASES) {
      const closes = [
        'notification-duplicate-event-stream-version',
        'notification-certifier-tenant-istat-not-found',
      ].includes(knownCase.id);
      assert.strictEqual(knownCase.analysis?.proposedStatus, closes ? 'COMPLETED' : 'IN_PROGRESS');
      assert.deepStrictEqual(knownCase.analysis?.finalActions, []);
      const citesTicket = knownCase.analysis?.links?.some((link) => link.url.endsWith('/PIN-7325'));
      assert.strictEqual(citesTicket ?? false, knownCase.id === 'notification-kafka-replica-retries-exhausted');
    }
    assert.deepStrictEqual(knownCaseById('notification-kafka-read-timeout').analysis?.downstreams, [
      INTEROP_DOWNSTREAMS.SELFCARE,
    ]);
    assert.ok(
      knownCaseById('notification-selfcare-tenant-not-found').analysis?.resolution.includes(
        "select * from <env>_tenant.tenant where selfcare_id = '<uuid>';",
      ),
    );
  });

  it('respects the environments recorded for the documented and newly observed signatures', () => {
    for (const id of [
      'notification-kafka-no-broker',
      'notification-kafka-metadata-timeout',
      'notification-kafka-read-timeout',
      'notification-remove-api-role-conflict',
    ]) {
      const fixture = CASE_FIXTURES.get(id);
      assert.ok(fixture);
      for (const environment of ['att', 'test']) {
        assert.strictEqual(
          evaluator.evaluate(
            knownCaseById(id).condition,
            context(
              [[NOTIFICATION_USER_LIFECYCLE_ALARM.stepIds.queryApplicationLogs, applicationLogRows(fixture)]],
              environment,
            ),
          ),
          false,
          `${id}: ${environment}`,
        );
      }
    }
    const replica = CASE_FIXTURES.get('notification-kafka-replica-retries-exhausted');
    assert.ok(replica);
    assert.strictEqual(
      evaluator.evaluate(
        knownCaseById('notification-kafka-replica-retries-exhausted').condition,
        context(
          [[NOTIFICATION_USER_LIFECYCLE_ALARM.stepIds.queryApplicationLogs, applicationLogRows(replica)]],
          'test',
        ),
      ),
      true,
    );
  });

  it('does not classify a generic connection reset or duplicate-key error', () => {
    const kafka = knownCaseById('notification-kafka-broker-communication-errors');
    const duplicate = knownCaseById('notification-duplicate-event-stream-version');
    const ctx = context([
      [
        NOTIFICATION_USER_LIFECYCLE_ALARM.stepIds.queryApplicationLogs,
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
