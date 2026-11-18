import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../__tests__/helpers/knownCaseTesting.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../__tests__/helpers/runbookExecution.js';
import { matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { TENANT_KIND_HISTORY_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';
import { buildRunbook } from '../runbook.js';

const COORDINATOR_ERRORS = 'tenant-kind-history-kafka-coordinator-errors';
const INCORRECT_COORDINATOR = 'tenant-kind-history-kafka-incorrect-coordinator';
const HEARTBEAT = 'ERROR - Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member';
const REFUSED =
  'Connection error: connect ECONNREFUSED The coordinator is not aware of this member, re-joining the group';

function matches(
  messages: ReadonlyArray<string>,
  environment = 'prod',
  stepId = alarm.stepIds.queryApplicationLogs,
): ReadonlyArray<string> {
  const rows = podLogRows(alarm.podApp, messages);
  const output = stepId === alarm.stepIds.queryCidTracker ? cidTrackerOutput(rows) : rows;
  return matchingCaseIds(KNOWN_CASES, conditionContext([[stepId, output]], environment));
}

describe('Tenant kind history consumer known cases', () => {
  it('recognizes the documented Heartbeat and refused-rejoin signatures in raw and structured logs', () => {
    for (const message of [HEARTBEAT, REFUSED]) {
      assert.deepStrictEqual(matches([message]), [COORDINATOR_ERRORS], message);
      assert.deepStrictEqual(matches([JSON.stringify({ log: message, pod_app: alarm.podApp })]), [COORDINATOR_ERRORS]);
    }
  });

  it('recognizes only the operation/error pairs observed for the incorrect coordinator', () => {
    for (const prefix of [
      'Response Heartbeat(key: 12, version: 3) - ',
      'Response JoinGroup(key: 11, version: 5) - ',
      'Response LeaveGroup(key: 13, version: 3) - ',
      'Crash: KafkaJSNonRetriableError: ',
    ]) {
      const message = `${prefix}This is not the correct coordinator for this group`;
      assert.deepStrictEqual(matches([message]), [INCORRECT_COORDINATOR], message);
      assert.deepStrictEqual(matches([JSON.stringify({ log: message })]), [INCORRECT_COORDINATOR]);
    }
  });

  it('does not extend the production cases to other environments or to CID tracker evidence', () => {
    const messages = [
      HEARTBEAT,
      REFUSED,
      'Crash: KafkaJSNonRetriableError: This is not the correct coordinator for this group',
    ];
    for (const environment of ['att', 'test', 'dev']) assert.deepStrictEqual(matches(messages, environment), []);
    assert.deepStrictEqual(matches(messages, 'prod', alarm.stepIds.queryCidTracker), []);
  });

  it('does not generalize undocumented signatures or combine fragments from separate rows', () => {
    for (const messages of [
      ['Connection error: connect ECONNREFUSED'],
      ['Connection error: connect ETIMEDOUT'],
      ['The coordinator is not aware of this member'],
      ['Response Heartbeat(key: 12, version: 3) - The group coordinator is not available'],
      [HEARTBEAT.replace('version: 3', 'version: 4')],
      [`${HEARTBEAT}Other`],
      ['ReadTimeoutException'],
      ['Response Heartbeat(key: 12, version: 3)', 'The coordinator is not aware of this member'],
      ['Connection error: connect ECONNREFUSED', 'The coordinator is not aware of this member, re-joining the group'],
      ['This is not the correct coordinator for this group'],
      ['Response Heartbeat(key: 12, version: 3)', 'This is not the correct coordinator for this group'],
      ['Crash: KafkaJSNonRetriableError: A different error'],
      ['Response Metadata(key: 3, version: 6) - This is not the correct coordinator for this group'],
      ['Error Consumer crashed {"error":{"name":"KafkaJSNonRetriableError"},"restart":false}'],
    ]) {
      assert.deepStrictEqual(matches(messages), [], messages.join(' | '));
    }
  });

  it('reads the production namespace and does not attribute another service’s failure from a shared CID', async () => {
    const own = await executeAlarmWithLogs(
      buildRunbook(),
      alarm.runbookKey,
      interopPodResponder({ podApp: alarm.podApp, messages: [HEARTBEAT] }),
    );
    assert.deepStrictEqual(own.matchedIds, [COORDINATOR_ERRORS]);
    assert.match(
      own.queries[0]?.query ?? '',
      /pod_namespace = "prod" and pod_app = "interop-be-tenant-kind-history-consumer"/u,
    );

    const shared = await executeAlarmWithLogs(
      buildRunbook(),
      alarm.runbookKey,
      interopPodResponder({
        podApp: alarm.podApp,
        messages: ['ERROR - Unknown failure'],
        cid: 'shared-cid',
        trackerMessages: [HEARTBEAT],
      }),
    );
    assert.strictEqual(shared.queries.length, 2);
    assert.deepStrictEqual(shared.matchedIds, []);
  });
});
