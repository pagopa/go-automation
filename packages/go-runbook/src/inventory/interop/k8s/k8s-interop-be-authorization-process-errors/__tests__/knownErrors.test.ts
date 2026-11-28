import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownErrorTesting.js';
import { matchingKnownErrorCodes } from '../../../../../__tests__/helpers/knownErrorMatching.js';
import { AUTHORIZATION_PROCESS_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_ERRORS } from '../knownErrors.js';

const LOCK_TIMEOUT = 'KafkaJSLockTimeout: Timeout while acquiring lock';
const DUPLICATE =
  'Error creating event: error: duplicate key value violates unique constraint "events_stream_id_version_key"';

const FIXTURES: ReadonlyArray<readonly [string, string]> = [
  [
    'INTEROP_K8S_K8IBAPE_AUT-PRO-CON-TER-BY-ADM',
    'ERROR - Error uncaughtException intercepted; Error detail: error: terminating connection due to administrator command',
  ],
  ['INTEROP_K8S_K8IBAPE_AUT-PRO-CLO-CON-WHI-SEN', 'Failed to send messages: Closed connection'],
  ['INTEROP_K8S_K8IBAPE_AUT-PRO-KAF-LOC-TIM', LOCK_TIMEOUT],
  [
    'INTEROP_K8S_K8IBAPE_AUT-PRO-CLI-WIT-KEY-UNA',
    'GET http://interop-be-authorization-process.prod.svc.cluster.local:8088/clientsWithKeys 401:Unauthorized. Error getting public key.',
  ],
  ['INTEROP_K8S_K8IBAPE_AUT-PRO-DUP-EVE-STR-VER', DUPLICATE],
];

function applicationMatches(messages: ReadonlyArray<string>): ReadonlyArray<string> {
  return matchingKnownErrorCodes(
    KNOWN_ERRORS,
    conditionContext([[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, messages)]]),
  );
}

describe('authorization-process known errors', () => {
  for (const [id, message] of FIXTURES) {
    it(`recognizes the documented evidence in application logs and JSON-encoded CID traces: ${id}`, () => {
      assert.deepStrictEqual(applicationMatches([message]), [id]);
      const tracker = cidTrackerOutput(podLogRows(alarm.podApp, [JSON.stringify({ log: message })]));
      assert.deepStrictEqual(
        matchingKnownErrorCodes(KNOWN_ERRORS, conditionContext([[alarm.stepIds.queryCidTracker, tracker]])),
        [id],
      );
    });
  }

  it('does not broaden the known errors to generic connection, Kafka, 401 or duplicate errors', () => {
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
      'INTEROP_K8S_K8IBAPE_AUT-PRO-KAF-LOC-TIM',
      'INTEROP_K8S_K8IBAPE_AUT-PRO-DUP-EVE-STR-VER',
    ]);
  });
});
