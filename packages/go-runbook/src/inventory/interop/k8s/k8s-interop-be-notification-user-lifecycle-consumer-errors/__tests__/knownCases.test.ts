import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../__tests__/helpers/knownCaseTesting.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../__tests__/helpers/runbookExecution.js';
import { matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { NOTIFICATION_USER_LIFECYCLE_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';
import { buildRunbook } from '../runbook.js';

const BROKER = 'notification-kafka-broker-communication-errors';
const DUPLICATE_ID = 'notification-duplicate-event-stream-version';
const DUPLICATE =
  'Error creating event: error: duplicate key value violates unique constraint "events_stream_id_version_key"';
const METADATA = 'ERROR - Crash: KafkaJSNumberOfRetriesExceeded: Request Metadata(key: 3, version: 6) timed out';

const CASE_FIXTURES: ReadonlyArray<readonly [string, string]> = [
  ['notification-kafka-no-broker', 'ERROR - Crash: KafkaJSNoBrokerAvailableError: No broker available'],
  ['notification-kafka-metadata-timeout', METADATA],
  [
    'notification-kafka-replica-retries-exhausted',
    'ERROR - Crash: KafkaJSNumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
  ],
  [BROKER, 'ERROR - Connection error: read ECONNRESET'],
  ['notification-kafka-read-timeout', 'ERROR - Connection error: read ETIMEDOUT'],
  [DUPLICATE_ID, DUPLICATE],
  ['notification-certifier-tenant-istat-not-found', 'Message: Certifier tenant ISTAT not found'],
  [
    'notification-remove-api-role-conflict',
    'Error handling Kafka message. Topic: sc-users. Reason: Error removing role api from notification config for user <user> in tenant <tenant>. Reason: AxiosError: Request failed with status code 409',
  ],
  [
    'notification-selfcare-tenant-not-found',
    'Error handling Kafka message. Topic: sc-users. Partition number: 0. Offset: 1. Message: Error consuming message. Reason: Error: Tenant not found for selfcareId: <uuid>',
  ],
];

/** Cases documented for production only. */
const PROD_ONLY: ReadonlySet<string> = new Set([
  'notification-kafka-no-broker',
  'notification-kafka-metadata-timeout',
  'notification-kafka-read-timeout',
  'notification-remove-api-role-conflict',
]);

/** Cases that must stay ahead of the duplicate in a mixed window. */
const OPEN_ALONGSIDE_DUPLICATE: ReadonlySet<string> = new Set([
  'notification-remove-api-role-conflict',
  'notification-selfcare-tenant-not-found',
  'notification-kafka-metadata-timeout',
]);

function matches(messages: ReadonlyArray<string>, environment = 'prod'): ReadonlyArray<string> {
  const context = conditionContext(
    [[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, messages)]],
    environment,
  );
  return matchingCaseIds(KNOWN_CASES, context);
}

describe('INTEROP notification user lifecycle known cases', () => {
  it('matches every documented case in raw and JSON-encoded application logs', () => {
    for (const [id, message] of CASE_FIXTURES) {
      assert.ok(matches([message]).includes(id), id);
      assert.ok(matches([JSON.stringify({ log: message })]).includes(id), id);
    }
  });

  it('groups the observed Kafka connection failures under the broker communication case', () => {
    for (const message of [
      'Connection error: Client network socket disconnected before secure TLS connection was established',
      'The group coordinator is not available',
    ]) {
      assert.deepStrictEqual(matches([message]), [BROKER], message);
    }
  });

  it('does not classify evidence found only in the CID tracker', () => {
    const own = podLogRows(
      alarm.podApp,
      CASE_FIXTURES.map(([, message]) => JSON.stringify({ log: message })),
    );
    const ownContext = conditionContext([[alarm.stepIds.queryCidTracker, cidTrackerOutput(own)]]);
    for (const id of [BROKER, DUPLICATE_ID]) assert.ok(!matchingCaseIds(KNOWN_CASES, ownContext).includes(id), id);

    const other = podLogRows(
      'interop-be-another-service',
      CASE_FIXTURES.map(([, message]) => message),
    );
    const otherContext = conditionContext([
      [alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, ['ERROR - Unknown failure'])],
      [alarm.stepIds.queryCidTracker, cidTrackerOutput(other, 'shared')],
    ]);
    assert.deepStrictEqual(matchingCaseIds(KNOWN_CASES, otherContext), []);
  });

  it('respects the environments recorded for each signature', () => {
    for (const [id, message] of CASE_FIXTURES.filter(([caseId]) => PROD_ONLY.has(caseId))) {
      for (const environment of ['att', 'test']) assert.ok(!matches([message], environment).includes(id), id);
    }
    const replica = CASE_FIXTURES.find(([id]) => id === 'notification-kafka-replica-retries-exhausted')?.[1] ?? '';
    assert.ok(matches([replica], 'test').includes('notification-kafka-replica-retries-exhausted'));
  });

  it('does not classify a generic connection reset or another duplicate-key error', () => {
    assert.deepStrictEqual(
      matches([
        'Request failed: read ECONNRESET',
        'duplicate key value violates unique constraint "another_constraint"',
      ]),
      [],
    );
  });

  it('closes a duplicate emitted by this service only when no open case is also present', async () => {
    const run = async (messages: ReadonlyArray<string>): ReturnType<typeof executeAlarmWithLogs> =>
      executeAlarmWithLogs(
        buildRunbook(),
        `${alarm.runbookKey}-prod`,
        interopPodResponder({ podApp: alarm.podApp, messages }),
      );

    const alone = await run([DUPLICATE]);
    assert.deepStrictEqual(alone.matchedIds, [DUPLICATE_ID]);
    assert.strictEqual(alone.draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(alone.draft.proposedStatus, 'COMPLETED');

    for (const [id, message] of CASE_FIXTURES.filter(([caseId]) => OPEN_ALONGSIDE_DUPLICATE.has(caseId))) {
      const mixed = await run([DUPLICATE, message]);
      assert.strictEqual(mixed.matchedIds[0], id);
      assert.strictEqual(mixed.draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(mixed.draft.proposedStatus, 'IN_PROGRESS');
    }
  });
});
