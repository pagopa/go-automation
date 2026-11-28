import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownErrorTesting.js';
import { matchingKnownErrorCodes } from '../../../../../__tests__/helpers/knownErrorMatching.js';
import { SELFCARE_ONBOARDING_CONSUMER_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_ERRORS } from '../knownErrors.js';

const BROKER = 'INTEROP_K8S_K8IBSOCE_SEL-ONB-KAF-BRO-ERR';

function matches(messages: ReadonlyArray<string>, environment = 'prod'): ReadonlyArray<string> {
  const context = conditionContext(
    [[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, messages)]],
    environment,
  );
  return matchingKnownErrorCodes(KNOWN_ERRORS, context);
}

describe('INTEROP Selfcare onboarding consumer known errors', () => {
  it('matches every documented Kafka signature, including the spaced KafkaJS variant, only in prod', () => {
    for (const message of [
      'The coordinator is not aware of this member',
      'The group coordinator is not available',
      'Crash: KafkaJSNumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
      'Crash: KafkaJS NumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
      'Connection error: read ECONNRESET',
    ]) {
      assert.deepStrictEqual(matches([message]), [BROKER], message);
      for (const environment of ['att', 'test']) assert.deepStrictEqual(matches([message], environment), []);
    }
  });

  it('does not extend the Kafka case to generic resets or undocumented timeout, metadata or TLS signatures', () => {
    for (const message of [
      'Request failed: read ECONNRESET',
      'Connection error: read ETIMEDOUT',
      'Crash: KafkaJSNumberOfRetriesExceeded: Request Metadata(key: 3, version: 6) timed out',
      'Connection error: Client network socket disconnected before secure TLS connection was established',
    ]) {
      assert.deepStrictEqual(matches([message]), [], message);
    }
  });

  it('does not classify another service from a shared CID tracker', () => {
    const rows = podLogRows('another-service', ['Connection error: read ECONNRESET']);
    const context = conditionContext([[alarm.stepIds.queryCidTracker, cidTrackerOutput(rows)]]);
    assert.deepStrictEqual(matchingKnownErrorCodes(KNOWN_ERRORS, context), []);
  });

  for (const [id, message] of [
    [
      'INTEROP_K8S_K8IBSOCE_SEL-ONB-CON-MES-CON',
      'Error consuming message in partition 0 with offset 14961. Reason: AxiosError: Request failed with status code 409',
    ],
    [
      'INTEROP_K8S_K8IBSOCE_SEL-ONB-OFF-COM-SER-ERR',
      'Response OffsetCommit(key: 8, version: 5) - The server experienced an unexpected error when processing the request',
    ],
  ] as const) {
    it(`recognizes the documented Test-only case: ${id}`, () => {
      assert.deepStrictEqual(matches([message], 'test'), [id]);
      for (const environment of ['prod', 'att']) assert.deepStrictEqual(matches([message], environment), []);
    });
  }
});
