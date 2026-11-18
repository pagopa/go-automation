import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { executeAlarmWithLogs, interopPodResponder } from '../../../__tests__/helpers/runbookExecution.js';
import { NOTIFICATION_SCHEDULER_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

const HEARTBEAT = 'ERROR - Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member';
const REJOIN =
  'ERROR - The coordinator is not aware of this member, re-joining the group - The coordinator is not aware of this member';

describe('notification scheduler known cases', () => {
  it('recognizes the heartbeat and the rejoin signatures without CID', async () => {
    for (const message of [HEARTBEAT, REJOIN]) {
      const { matchedIds } = await executeAlarmWithLogs(
        buildRunbook(),
        `${alarm.runbookKey}-prod`,
        interopPodResponder({ podApp: alarm.podApp, messages: [message] }),
      );
      assert.deepStrictEqual(matchedIds, ['notification-scheduler-kafka-member-rejoin'], message);
    }
  });

  it('does not attribute another service’s coordinator error in the CID trace to the scheduler', async () => {
    const { matchedIds, queries } = await executeAlarmWithLogs(
      buildRunbook(),
      `${alarm.runbookKey}-prod`,
      interopPodResponder({
        podApp: alarm.podApp,
        messages: ['ERROR - Unknown application failure'],
        cid: 'test-cid',
        trackerMessages: [HEARTBEAT],
      }),
    );
    assert.strictEqual(queries.length, 3);
    assert.deepStrictEqual(matchedIds, []);
  });

  it('does not extend the production case to test or att', async () => {
    for (const environment of ['test', 'att']) {
      const { matchedIds } = await executeAlarmWithLogs(
        buildRunbook(),
        `${alarm.runbookKey}-${environment}`,
        interopPodResponder({ podApp: alarm.podApp, messages: [HEARTBEAT] }),
      );
      assert.deepStrictEqual(matchedIds, []);
    }
  });
});
