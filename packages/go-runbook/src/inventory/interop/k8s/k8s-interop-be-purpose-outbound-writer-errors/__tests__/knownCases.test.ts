import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownCaseTesting.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../shared/__tests__/helpers/runbookExecution.js';
import { matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { PURPOSE_OUTBOUND_WRITER_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';
import { buildRunbook } from '../runbook.js';

const REJOIN = 'ERROR - The coordinator is not aware of this member, re-joining the group';
const COORDINATOR =
  'ERROR - Response Heartbeat(key: 12, version: 3) - This is not the correct coordinator for this group';

describe('INTEROP purpose outbound writer known cases', () => {
  for (const [message, expected] of [
    [
      'ERROR - Connection error: connect ECONNREFUSED 10.0.38.131:9098',
      'purpose-outbound-writer-kafka-connection-refused',
    ],
    [
      'ERROR - Error Consumer crashed {"type":"consumer.crash","payload":{"error":{"name":"KafkaJSNumberOfRetriesExceeded"},"restart":false}}.',
      'purpose-outbound-writer-kafka-retries-exhausted',
    ],
    [COORDINATOR, 'purpose-outbound-writer-kafka-wrong-coordinator'],
    [REJOIN, 'purpose-outbound-writer-kafka-member-rejoin'],
  ] as const) {
    it(`recognizes ${expected} in an execution without CID`, async () => {
      const { matchedIds } = await executeAlarmWithLogs(
        buildRunbook(),
        `${alarm.runbookKey}-prod`,
        interopPodResponder({ podApp: alarm.podApp, messages: [message] }),
      );
      assert.deepStrictEqual(matchedIds, [expected]);
    });
  }

  it('does not attribute another service’s coordinator error in the CID trace to the writer', async () => {
    const { matchedIds, queries } = await executeAlarmWithLogs(
      buildRunbook(),
      `${alarm.runbookKey}-prod`,
      interopPodResponder({
        podApp: alarm.podApp,
        messages: ['ERROR - Unknown application failure'],
        cid: 'test-cid',
        trackerMessages: [COORDINATOR],
      }),
    );
    assert.strictEqual(queries.length, 3);
    assert.deepStrictEqual(matchedIds, []);
  });

  it('does not extend production known cases to test or att', async () => {
    for (const environment of ['test', 'att']) {
      const { matchedIds } = await executeAlarmWithLogs(
        buildRunbook(),
        `${alarm.runbookKey}-${environment}`,
        interopPodResponder({ podApp: alarm.podApp, messages: [COORDINATOR] }),
      );
      assert.deepStrictEqual(matchedIds, []);
    }
  });

  it('does not classify CID-only evidence or a different Kafka coordinator error', () => {
    const tracker = conditionContext([
      [alarm.stepIds.queryCidTracker, cidTrackerOutput(podLogRows(alarm.podApp, [JSON.stringify({ log: REJOIN })]))],
    ]);
    assert.deepStrictEqual(matchingCaseIds(KNOWN_CASES, tracker), []);
    const unavailable = conditionContext([
      [
        alarm.stepIds.queryApplicationLogs,
        podLogRows(alarm.podApp, ['ERROR - The group coordinator is not available']),
      ],
    ]);
    assert.deepStrictEqual(matchingCaseIds(KNOWN_CASES, unavailable), []);
  });
});
