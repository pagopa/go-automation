import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../__tests__/helpers/knownCaseTesting.js';
import { matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { TENANT_READMODEL_WRITER_SQL_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';

const TLS = 'ERROR - Connection error: Client network socket disconnected before secure TLS connection was established';

describe('tenant readmodel writer SQL known cases', () => {
  it('matches the documented Kafka TLS error in application logs and CID tracker evidence', () => {
    const application = conditionContext([[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, [TLS])]]);
    assert.strictEqual(matchingCaseIds(KNOWN_CASES, application).length, 1);
    const rows = podLogRows(alarm.podApp, [JSON.stringify({ log: TLS })]);
    const tracker = conditionContext([[alarm.stepIds.queryCidTracker, cidTrackerOutput(rows)]]);
    assert.strictEqual(matchingCaseIds(KNOWN_CASES, tracker).length, 1);
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
