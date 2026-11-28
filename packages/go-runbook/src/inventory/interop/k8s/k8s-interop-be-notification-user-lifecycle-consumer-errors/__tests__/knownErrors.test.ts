import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownErrorTesting.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../shared/__tests__/helpers/runbookExecution.js';
import { matchingKnownErrorCodes } from '../../../../../__tests__/helpers/knownErrorMatching.js';
import { NOTIFICATION_USER_LIFECYCLE_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_ERRORS } from '../knownErrors.js';
import { buildRunbook } from '../runbook.js';

const BROKER = 'INTEROP_K8S_K8IBNULCE_NOT-KAF-BRO-COM-ERR';
const DUPLICATE_ID = 'INTEROP_K8S_K8IBNULCE_NOT-DUP-EVE-STR-VER';
const DUPLICATE =
  'Error creating event: error: duplicate key value violates unique constraint "events_stream_id_version_key"';
const METADATA = 'ERROR - Crash: KafkaJSNumberOfRetriesExceeded: Request Metadata(key: 3, version: 6) timed out';

const CASE_FIXTURES: ReadonlyArray<readonly [string, string]> = [
  ['INTEROP_K8S_K8IBNULCE_NOT-KAF-NO-BRO', 'ERROR - Crash: KafkaJSNoBrokerAvailableError: No broker available'],
  ['INTEROP_K8S_K8IBNULCE_NOT-KAF-MET-TIM', METADATA],
  [
    'INTEROP_K8S_K8IBNULCE_NOT-KAF-REP-RET-EXH',
    'ERROR - Crash: KafkaJSNumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
  ],
  [BROKER, 'ERROR - Connection error: read ECONNRESET'],
  ['INTEROP_K8S_K8IBNULCE_NOT-KAF-REA-TIM', 'ERROR - Connection error: read ETIMEDOUT'],
  [DUPLICATE_ID, DUPLICATE],
  ['INTEROP_K8S_K8IBNULCE_NOT-CER-TEN-IST-NOT-FOU', 'Message: Certifier tenant ISTAT not found'],
  [
    'INTEROP_K8S_K8IBNULCE_NOT-REM-API-ROL-CON',
    'Error handling Kafka message. Topic: sc-users. Reason: Error removing role api from notification config for user <user> in tenant <tenant>. Reason: AxiosError: Request failed with status code 409',
  ],
  [
    'INTEROP_K8S_K8IBNULCE_NOT-SEL-TEN-NOT-FOU',
    'Error handling Kafka message. Topic: sc-users. Partition number: 0. Offset: 1. Message: Error consuming message. Reason: Error: Tenant not found for selfcareId: <uuid>',
  ],
];

/** Cases documented for production only. */
const PROD_ONLY: ReadonlySet<string> = new Set([
  'INTEROP_K8S_K8IBNULCE_NOT-KAF-NO-BRO',
  'INTEROP_K8S_K8IBNULCE_NOT-KAF-REA-TIM',
]);

/** Open cases reported alongside the duplicate in a mixed window. */
const OPEN_ALONGSIDE_DUPLICATE: ReadonlySet<string> = new Set([
  'INTEROP_K8S_K8IBNULCE_NOT-REM-API-ROL-CON',
  'INTEROP_K8S_K8IBNULCE_NOT-SEL-TEN-NOT-FOU',
  'INTEROP_K8S_K8IBNULCE_NOT-KAF-MET-TIM',
]);

function matches(messages: ReadonlyArray<string>, environment = 'prod'): ReadonlyArray<string> {
  const context = conditionContext(
    [[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, messages)]],
    environment,
  );
  return matchingKnownErrorCodes(KNOWN_ERRORS, context);
}

describe('INTEROP notification user lifecycle known errors', () => {
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
    for (const id of [BROKER, DUPLICATE_ID])
      assert.ok(!matchingKnownErrorCodes(KNOWN_ERRORS, ownContext).includes(id), id);

    const other = podLogRows(
      'interop-be-another-service',
      CASE_FIXTURES.map(([, message]) => message),
    );
    const otherContext = conditionContext([
      [alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, ['ERROR - Unknown failure'])],
      [alarm.stepIds.queryCidTracker, cidTrackerOutput(other, 'shared')],
    ]);
    assert.deepStrictEqual(matchingKnownErrorCodes(KNOWN_ERRORS, otherContext), []);
  });

  it('respects the environments recorded for each signature', () => {
    for (const [id, message] of CASE_FIXTURES.filter(([knownErrorCode]) => PROD_ONLY.has(knownErrorCode))) {
      for (const environment of ['att', 'test']) assert.ok(!matches([message], environment).includes(id), id);
    }
    const replica = CASE_FIXTURES.find(([id]) => id === 'INTEROP_K8S_K8IBNULCE_NOT-KAF-REP-RET-EXH')?.[1] ?? '';
    assert.ok(matches([replica], 'test').includes('INTEROP_K8S_K8IBNULCE_NOT-KAF-REP-RET-EXH'));
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

  it('closes a duplicate emitted by this service and reports the open cases found with it', async () => {
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

    for (const [id, message] of CASE_FIXTURES.filter(([knownErrorCode]) =>
      OPEN_ALONGSIDE_DUPLICATE.has(knownErrorCode),
    )) {
      const mixed = await run([DUPLICATE, message]);
      assert.deepStrictEqual([...mixed.matchedIds].sort(), [DUPLICATE_ID, id].sort());
      // One closable case is enough to propose the closure; the notes list both.
      assert.strictEqual(mixed.draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(mixed.draft.proposedStatus, 'COMPLETED');
      assert.match(mixed.draft.conclusionNotes, /^1\. /u);
    }
  });

  it('recognizes the 409 of the notification config check in every environment', () => {
    const message =
      'ERROR - Error in request to ensure a notification config exists for user 13a76b82-2f50-4c25-93d2-52855b719180 in tenant a212c9a0-81fc-4fdf-b799-d7780552aa82 with role security. Reason: AxiosError: Request failed with status code 409';
    for (const environment of ['prod', 'att', 'test']) {
      assert.deepStrictEqual(
        matches([message], environment),
        ['INTEROP_K8S_K8IBNULCE_NOT-ENS-CON-CON-409'],
        environment,
      );
    }
    assert.deepStrictEqual(matches([message.replace('code 409', 'code 500')], 'test'), []);
  });
});
