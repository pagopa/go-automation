import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../__tests__/helpers/knownCaseTesting.js';
import { matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { COMPUTE_AGREEMENTS_CONSUMER_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';

const TLS = 'Connection error: Client network socket disconnected before secure TLS connection was established';

describe('INTEROP compute agreements consumer known cases', () => {
  for (const [id, message] of [
    [
      'compute-agreements-kafka-wrong-group-coordinator',
      'Error when calling eachMessage - Error: [compute-agreements-consumer] - ' +
        '[CID=f672700a-8f22-4d0e-9055-5ea8f1991e35] [ET=TenantCertifiedAttributeAssigned] ' +
        'Error handling Kafka message. Message: This is not the correct coordinator for this group',
    ],
    ['compute-agreements-kafka-member-rejoin', 'The coordinator is not aware of this member, re-joining the group'],
    ['compute-agreements-tls-connection-error', TLS],
  ] as const) {
    it(`matches the documented message: ${id}`, () => {
      const context = conditionContext([[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, [message])]]);
      assert.deepStrictEqual(matchingCaseIds(KNOWN_CASES, context), [id]);
    });
  }

  it('matches documented evidence returned by the CID tracker, including JSON-encoded logs', () => {
    const rows = podLogRows(alarm.podApp, [JSON.stringify({ log: TLS })]);
    const context = conditionContext([[alarm.stepIds.queryCidTracker, cidTrackerOutput(rows)]]);
    assert.deepStrictEqual(matchingCaseIds(KNOWN_CASES, context), ['compute-agreements-tls-connection-error']);
  });

  it('does not broaden the cases to undocumented generic Kafka or network errors', () => {
    const rows = podLogRows(alarm.podApp, [
      'The group coordinator is not available',
      'KafkaJSNumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
      'Request failed: Client network socket disconnected before secure TLS connection was established',
    ]);
    assert.deepStrictEqual(
      matchingCaseIds(KNOWN_CASES, conditionContext([[alarm.stepIds.queryApplicationLogs, rows]])),
      [],
    );
  });
});
