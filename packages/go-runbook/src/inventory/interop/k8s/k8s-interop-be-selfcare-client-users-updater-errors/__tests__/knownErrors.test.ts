import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownErrorTesting.js';
import { matchingKnownErrorCodes } from '../../../../../__tests__/helpers/knownErrorMatching.js';
import { SELFCARE_USERS_UPDATER_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_ERRORS } from '../knownErrors.js';

const BROKER = 'INTEROP_K8S_K8IBSCUUE_SEL-USE-UPD-KAF-BRO-ERR';
const COORDINATOR_MESSAGES: ReadonlyArray<string> = [
  'The coordinator is not aware of this member',
  'The group coordinator is not available',
  'Crash: KafkaJSNumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
  "The coordinator is loading and hence can't process requests for this group",
];
const RESET = 'ERROR - Connection error: read ECONNRESET';
const METADATA = 'ERROR - Crash: KafkaJSNumberOfRetriesExceeded: Request Metadata(key: 3, version: 6) timed out';
const TLS = 'Connection error: Client network socket disconnected before secure TLS connection was established';

function matches(messages: ReadonlyArray<string>, environment = 'prod'): ReadonlyArray<string> {
  const context = conditionContext(
    [[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, messages)]],
    environment,
  );
  return matchingKnownErrorCodes(KNOWN_ERRORS, context);
}

describe('INTEROP Selfcare users updater known errors', () => {
  it('recognizes the documented coordinator and replica signatures, also with the spaced KafkaJS name', () => {
    for (const message of [
      ...COORDINATOR_MESSAGES,
      'Crash: KafkaJS NumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
    ]) {
      assert.deepStrictEqual(matches([message]), [BROKER], message);
    }
  });

  it('separates ECONNRESET and Metadata timeout in prod and test', () => {
    for (const [message, id] of [
      [RESET, 'INTEROP_K8S_K8IBSCUUE_SEL-KAF-CON-RES'],
      [METADATA, 'INTEROP_K8S_K8IBSCUUE_SEL-KAF-MET-TIM'],
    ] as const) {
      assert.deepStrictEqual(matches([message]), [id]);
      assert.deepStrictEqual(matches([message], 'test'), [id]);
    }
  });

  it('recognizes the observed TLS interruption only in production', () => {
    for (const message of [TLS, `Crash: KafkaJSNumberOfRetriesExceeded: ${TLS}`]) {
      assert.deepStrictEqual(matches([message]), ['INTEROP_K8S_K8IBSCUUE_SEL-KAF-TLS-CON-INT']);
    }
    assert.deepStrictEqual(matches([TLS], 'test'), []);
  });

  it('respects documented environment scopes without treating att as test', () => {
    assert.deepStrictEqual(matches([COORDINATOR_MESSAGES[0] ?? ''], 'test'), []);
    for (const message of COORDINATOR_MESSAGES.slice(1)) assert.deepStrictEqual(matches([message], 'test'), [BROKER]);
    assert.deepStrictEqual(matches([...COORDINATOR_MESSAGES, RESET, METADATA, TLS], 'att'), []);
  });

  it('does not classify another service from CID tracker evidence', () => {
    const rows = podLogRows('interop-be-other-service', [...COORDINATOR_MESSAGES, RESET, METADATA, TLS]);
    const context = conditionContext([
      [alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, ['Unknown error [CID=cid-1]'])],
      [alarm.stepIds.queryCidTracker, cidTrackerOutput(rows)],
    ]);
    assert.deepStrictEqual(matchingKnownErrorCodes(KNOWN_ERRORS, context), []);
  });

  it('leaves generic resets, timeouts and consumer crash summaries unclassified', () => {
    for (const message of [
      'Request failed: read ECONNRESET',
      'Connection error: read ETIMEDOUT',
      'Error Consumer crashed {"payload":{"error":{"name":"KafkaJSNumberOfRetriesExceeded"}}}',
      'KafkaJSNumberOfRetriesExceeded: Request Metadata(key: 9, version: 9) timed out',
    ]) {
      assert.deepStrictEqual(matches([message]), [], message);
    }
  });
});
