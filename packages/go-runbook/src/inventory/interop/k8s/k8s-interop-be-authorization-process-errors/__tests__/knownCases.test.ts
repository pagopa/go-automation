import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownCaseTesting.js';
import { matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { AUTHORIZATION_PROCESS_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';

const LOCK_TIMEOUT = 'KafkaJSLockTimeout: Timeout while acquiring lock';
const DUPLICATE =
  'Error creating event: error: duplicate key value violates unique constraint "events_stream_id_version_key"';

const FIXTURES: ReadonlyArray<readonly [string, string]> = [
  [
    'authorization-process-connection-terminated-by-administrator',
    'ERROR - Error uncaughtException intercepted; Error detail: error: terminating connection due to administrator command',
  ],
  ['authorization-process-closed-connection-while-sending', 'Failed to send messages: Closed connection'],
  ['authorization-process-kafka-lock-timeout', LOCK_TIMEOUT],
  [
    'authorization-process-clients-with-keys-unauthorized',
    'GET http://interop-be-authorization-process.prod.svc.cluster.local:8088/clientsWithKeys 401:Unauthorized. Error getting public key.',
  ],
  ['authorization-process-duplicate-event-stream-version', DUPLICATE],
];

function applicationMatches(messages: ReadonlyArray<string>): ReadonlyArray<string> {
  return matchingCaseIds(
    KNOWN_CASES,
    conditionContext([[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, messages)]]),
  );
}

describe('authorization-process known cases', () => {
  for (const [id, message] of FIXTURES) {
    it(`recognizes the documented evidence in application logs and JSON-encoded CID traces: ${id}`, () => {
      assert.deepStrictEqual(applicationMatches([message]), [id]);
      const tracker = cidTrackerOutput(podLogRows(alarm.podApp, [JSON.stringify({ log: message })]));
      assert.deepStrictEqual(
        matchingCaseIds(KNOWN_CASES, conditionContext([[alarm.stepIds.queryCidTracker, tracker]])),
        [id],
      );
    });
  }

  it('does not broaden the known cases to generic connection, Kafka, 401 or duplicate errors', () => {
    assert.deepStrictEqual(
      applicationMatches([
        'terminating connection because the client disconnected',
        'Failed to send messages: Permission denied',
        'KafkaJSConnectionError: Connection error',
        'GET /clientsWithKeys 500:Internal Server Error. Error getting public key.',
        'GET /otherEndpoint 401:Unauthorized. Error getting public key.',
        'duplicate key value violates unique constraint "another_constraint"',
      ]),
      [],
    );
  });

  it('keeps actionable evidence primary when the retry-managed duplicate is also present', () => {
    assert.deepStrictEqual(applicationMatches([LOCK_TIMEOUT, DUPLICATE]), [
      'authorization-process-kafka-lock-timeout',
      'authorization-process-duplicate-event-stream-version',
    ]);
  });
});
