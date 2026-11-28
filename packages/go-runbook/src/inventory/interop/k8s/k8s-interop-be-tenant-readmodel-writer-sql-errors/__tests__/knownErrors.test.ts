import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownErrorTesting.js';
import { matchingKnownErrorCodes } from '../../../../../__tests__/helpers/knownErrorMatching.js';
import { TENANT_READMODEL_WRITER_SQL_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_ERRORS } from '../knownErrors.js';

const TLS = 'ERROR - Connection error: Client network socket disconnected before secure TLS connection was established';
const TLS_CASE = 'INTEROP_K8S_K8IBTRWSE_TEN-REA-WRI-SQL-KAF-TLS-CON-ERR';
const UNKNOWN_MEMBER_CASE = 'INTEROP_K8S_K8IBTRWSE_TEN-REA-WRI-SQL-KAF-COO-UNK-MEM';
const HEARTBEAT = 'ERROR -  Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member';
const REJOIN =
  'ERROR -  The coordinator is not aware of this member, re-joining the group - The coordinator is not aware of this member';

function applicationLogsKnownErrorCodes(messages: ReadonlyArray<string>): ReadonlyArray<string> {
  const context = conditionContext([[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, messages)]]);
  return matchingKnownErrorCodes(KNOWN_ERRORS, context);
}

describe('tenant readmodel writer SQL known errors', () => {
  it('matches the documented Kafka TLS error in application logs and CID tracker evidence', () => {
    const application = conditionContext([[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, [TLS])]]);
    assert.deepStrictEqual(matchingKnownErrorCodes(KNOWN_ERRORS, application), [TLS_CASE]);
    const rows = podLogRows(alarm.podApp, [JSON.stringify({ log: TLS })]);
    const tracker = conditionContext([[alarm.stepIds.queryCidTracker, cidTrackerOutput(rows)]]);
    assert.deepStrictEqual(matchingKnownErrorCodes(KNOWN_ERRORS, tracker), [TLS_CASE]);
  });

  it('matches the documented heartbeat of an unknown member, alone or with the rejoin', () => {
    for (const messages of [[HEARTBEAT], [REJOIN], [HEARTBEAT, REJOIN]]) {
      assert.deepStrictEqual(applicationLogsKnownErrorCodes(messages), [UNKNOWN_MEMBER_CASE], messages.join(' | '));
    }
  });

  it('does not match the Kafka errors of the maintenance windows', () => {
    for (const message of [
      'ERROR -  Connection error: connect ECONNREFUSED 10.0.36.169:9098',
      'ERROR -  Response Heartbeat(key: 12, version: 3) - This is not the correct coordinator for this group',
      'ERROR -  Response JoinGroup(key: 11, version: 5) - This is not the correct coordinator for this group',
      'ERROR -  Crash: KafkaJSNonRetriableError: This is not the correct coordinator for this group',
    ]) {
      assert.deepStrictEqual(applicationLogsKnownErrorCodes([message]), [], message);
    }
  });

  it('does not match other connection errors or the TLS message without the ERROR prefix', () => {
    for (const message of [
      'ERROR - Connection timeout',
      'ERROR - Connection error: Connection refused',
      'Request failed: Client network socket disconnected before secure TLS connection was established',
    ]) {
      const context = conditionContext([[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, [message])]]);
      assert.deepStrictEqual(matchingKnownErrorCodes(KNOWN_ERRORS, context), [], message);
    }
  });
});
