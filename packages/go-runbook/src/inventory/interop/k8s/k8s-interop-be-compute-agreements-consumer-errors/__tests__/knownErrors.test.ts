import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownErrorTesting.js';
import { matchingKnownErrorCodes } from '../../../../../__tests__/helpers/knownErrorMatching.js';
import { COMPUTE_AGREEMENTS_CONSUMER_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_ERRORS } from '../knownErrors.js';

const TLS = 'Connection error: Client network socket disconnected before secure TLS connection was established';

describe('INTEROP compute agreements consumer known errors', () => {
  for (const [id, message] of [
    [
      'INTEROP_K8S_K8IBCACE_COM-AGR-KAF-WRO-GRO-COO',
      'Error when calling eachMessage - Error: [compute-agreements-consumer] - ' +
        '[CID=f672700a-8f22-4d0e-9055-5ea8f1991e35] [ET=TenantCertifiedAttributeAssigned] ' +
        'Error handling Kafka message. Message: This is not the correct coordinator for this group',
    ],
    ['INTEROP_K8S_K8IBCACE_COM-AGR-KAF-MEM-REJ', 'The coordinator is not aware of this member, re-joining the group'],
    ['INTEROP_K8S_K8IBCACE_COM-AGR-TLS-CON-ERR', TLS],
  ] as const) {
    it(`matches the documented message: ${id}`, () => {
      const context = conditionContext([[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, [message])]]);
      assert.deepStrictEqual(matchingKnownErrorCodes(KNOWN_ERRORS, context), [id]);
    });
  }

  it('matches documented evidence returned by the CID tracker, including JSON-encoded logs', () => {
    const rows = podLogRows(alarm.podApp, [JSON.stringify({ log: TLS })]);
    const context = conditionContext([[alarm.stepIds.queryCidTracker, cidTrackerOutput(rows)]]);
    assert.deepStrictEqual(matchingKnownErrorCodes(KNOWN_ERRORS, context), [
      'INTEROP_K8S_K8IBCACE_COM-AGR-TLS-CON-ERR',
    ]);
  });

  it('does not broaden the cases to undocumented generic Kafka or network errors', () => {
    const rows = podLogRows(alarm.podApp, [
      'The group coordinator is not available',
      'KafkaJSNumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
      'Request failed: Client network socket disconnected before secure TLS connection was established',
    ]);
    assert.deepStrictEqual(
      matchingKnownErrorCodes(KNOWN_ERRORS, conditionContext([[alarm.stepIds.queryApplicationLogs, rows]])),
      [],
    );
  });
});
