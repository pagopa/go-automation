import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../__tests__/helpers/knownCaseTesting.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../__tests__/helpers/runbookExecution.js';
import { matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { DELEGATION_ITEMS_ARCHIVER_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';
import { buildRunbook } from '../runbook.js';

const HEARTBEAT = 'ERROR - Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member';
const REFUSED = 'ERROR - Connection error: connect ECONNREFUSED 10.0.0.10:9098';
const CRASH =
  'ERROR - Error Consumer crashed {"type":"consumer.crash","payload":{"error":{"name":"KafkaJSNumberOfRetriesExceeded"},"restart":false}}.';
const COORDINATOR =
  'ERROR - Response Heartbeat(key: 12, version: 3) - This is not the correct coordinator for this group';

async function matchedIds(messages: ReadonlyArray<string>, environment = 'prod'): Promise<ReadonlyArray<string>> {
  const execution = await executeAlarmWithLogs(
    buildRunbook(),
    `${alarm.runbookKey}-${environment}`,
    interopPodResponder({ podApp: alarm.podApp, messages }),
  );
  return execution.matchedIds;
}

describe('delegation items archiver known cases', () => {
  for (const [message, expected] of [
    [HEARTBEAT, 'heartbeat-unknown-member'],
    [HEARTBEAT.replace('version: 3', 'version: 4'), 'heartbeat-unknown-member'],
    ['ERROR - The coordinator is not aware of this member, re-joining the group', 'heartbeat-unknown-member'],
    [REFUSED, 'connection-refused'],
    [CRASH, 'retries-exhausted'],
    [
      'ERROR - Crash: KafkaJSNumberOfRetriesExceeded: Connection error: connect ECONNREFUSED 10.0.0.10:9098',
      'retries-exhausted',
    ],
    [COORDINATOR, 'wrong-coordinator'],
  ] as const) {
    it(`recognizes ${expected} without CID: ${message.slice(8, 48)}`, async () => {
      assert.deepStrictEqual((await matchedIds([message]))[0], `delegation-items-archiver-kafka-${expected}`);
    });
  }

  it('prioritizes the crash when connection failures and coordinator errors coexist', async () => {
    assert.deepStrictEqual(await matchedIds([REFUSED, CRASH, COORDINATOR]), [
      'delegation-items-archiver-kafka-retries-exhausted',
      'delegation-items-archiver-kafka-connection-refused',
      'delegation-items-archiver-kafka-wrong-coordinator',
    ]);
  });

  it('does not extend production cases to att or test', async () => {
    for (const environment of ['att', 'test']) assert.deepStrictEqual(await matchedIds([HEARTBEAT], environment), []);
  });

  it('does not recognize the heartbeat from CID-only evidence or from similar messages', () => {
    const tracker = podLogRows(alarm.podApp, [JSON.stringify({ log: HEARTBEAT })]);
    assert.deepStrictEqual(
      matchingCaseIds(KNOWN_CASES, conditionContext([[alarm.stepIds.queryCidTracker, cidTrackerOutput(tracker)]])),
      [],
    );
    for (const message of [
      'The coordinator is not aware of this member, re-joining the group',
      'ERROR - Response Heartbeat(key: 12, version: 3) - The coordinator is not available',
      'ERROR - Connection error: Client network socket disconnected before secure TLS connection was established',
    ]) {
      const context = conditionContext([[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, [message])]]);
      assert.deepStrictEqual(matchingCaseIds(KNOWN_CASES, context), [], message);
    }
  });
});
