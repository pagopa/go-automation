import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownErrorTesting.js';
import { matchingKnownErrorCodes } from '../../../../../__tests__/helpers/knownErrorMatching.js';
import { NOTIFIER_SEEDER_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_ERRORS } from '../knownErrors.js';

function ids(messages: ReadonlyArray<string>): ReadonlyArray<string> {
  return matchingKnownErrorCodes(
    KNOWN_ERRORS,
    conditionContext([[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, messages)]]),
  );
}

describe('notifier seeder known errors', () => {
  it('recognizes the documented Kafka rejoin, with or without the reason', () => {
    for (const message of [
      'ERROR -  The coordinator is not aware of this member, re-joining the group - The coordinator is not aware of this member',
      'ERROR - The coordinator is not aware of this member, re-joining the group',
    ]) {
      assert.deepStrictEqual(ids([message]), ['INTEROP_K8S_K8IBNSE_NOT-SEE-KAF-COO-MEM-REJ'], message);
    }
  });

  it('recognizes the offset commit sent to a broker that is no longer the coordinator', () => {
    assert.deepStrictEqual(
      ids(['ERROR -  Response OffsetCommit(key: 8, version: 5) - This is not the correct coordinator for this group']),
      ['INTEROP_K8S_K8IBNSE_NOT-SEE-OFF-COM-WRO-COO'],
    );
  });

  it('leaves the undocumented Kafka errors unclassified', () => {
    for (const message of [
      'ERROR -  Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member',
      'ERROR -  Response OffsetCommit(key: 8, version: 5) - The coordinator is not aware of this member',
      'ERROR -  Connection error: connect ECONNREFUSED 10.0.36.169:9098',
      'ERROR -  Response JoinGroup(key: 11, version: 5) - This is not the correct coordinator for this group',
    ]) {
      assert.deepStrictEqual(ids([message]), [], message);
    }
  });
});
