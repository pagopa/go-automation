import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownCaseTesting.js';
import { matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { TENANT_READMODEL_WRITER_SQL_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';

const TLS = 'ERROR - Connection error: Client network socket disconnected before secure TLS connection was established';
const TLS_CASE = 'tenant-readmodel-writer-sql-kafka-tls-connection-error';
const UNKNOWN_MEMBER_CASE = 'tenant-readmodel-writer-sql-kafka-coordinator-unknown-member';
const HEARTBEAT = 'ERROR -  Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member';
const REJOIN =
  'ERROR -  The coordinator is not aware of this member, re-joining the group - The coordinator is not aware of this member';

function applicationLogsCaseIds(messages: ReadonlyArray<string>): ReadonlyArray<string> {
  const context = conditionContext([[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, messages)]]);
  return matchingCaseIds(KNOWN_CASES, context);
}

describe('tenant readmodel writer SQL known cases', () => {
  it('matches the documented Kafka TLS error in application logs and CID tracker evidence', () => {
    const application = conditionContext([[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, [TLS])]]);
    assert.deepStrictEqual(matchingCaseIds(KNOWN_CASES, application), [TLS_CASE]);
    const rows = podLogRows(alarm.podApp, [JSON.stringify({ log: TLS })]);
    const tracker = conditionContext([[alarm.stepIds.queryCidTracker, cidTrackerOutput(rows)]]);
    assert.deepStrictEqual(matchingCaseIds(KNOWN_CASES, tracker), [TLS_CASE]);
  });

  it('matches the documented heartbeat of an unknown member, alone or with the rejoin', () => {
    for (const messages of [[HEARTBEAT], [REJOIN], [HEARTBEAT, REJOIN]]) {
      assert.deepStrictEqual(applicationLogsCaseIds(messages), [UNKNOWN_MEMBER_CASE], messages.join(' | '));
    }
  });

  it('does not match the Kafka errors of the maintenance windows', () => {
    for (const message of [
      'ERROR -  Connection error: connect ECONNREFUSED 10.0.36.169:9098',
      'ERROR -  Response Heartbeat(key: 12, version: 3) - This is not the correct coordinator for this group',
      'ERROR -  Response JoinGroup(key: 11, version: 5) - This is not the correct coordinator for this group',
      'ERROR -  Crash: KafkaJSNonRetriableError: This is not the correct coordinator for this group',
    ]) {
      assert.deepStrictEqual(applicationLogsCaseIds([message]), [], message);
    }
  });

  it('does not match other connection errors or the TLS message without the ERROR prefix', () => {
    for (const message of [
      'ERROR - Connection timeout',
      'ERROR - Connection error: Connection refused',
      'Request failed: Client network socket disconnected before secure TLS connection was established',
    ]) {
      const context = conditionContext([[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, [message])]]);
      assert.deepStrictEqual(matchingCaseIds(KNOWN_CASES, context), [], message);
    }
  });
});
