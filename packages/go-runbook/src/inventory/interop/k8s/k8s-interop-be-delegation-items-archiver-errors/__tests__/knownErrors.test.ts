import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownErrorTesting.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../shared/__tests__/helpers/runbookExecution.js';
import { matchingKnownErrorCodes } from '../../../../../__tests__/helpers/knownErrorMatching.js';
import { DELEGATION_ITEMS_ARCHIVER_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_ERRORS } from '../knownErrors.js';
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

describe('delegation items archiver known errors', () => {
  for (const [message, expected] of [
    [HEARTBEAT, 'INTEROP_K8S_K8IBDIAE_DEL-ITE-ARC-KAF-HEA-UNK-MEM'],
    [HEARTBEAT.replace('version: 3', 'version: 4'), 'INTEROP_K8S_K8IBDIAE_DEL-ITE-ARC-KAF-HEA-UNK-MEM'],
    [
      'ERROR - The coordinator is not aware of this member, re-joining the group',
      'INTEROP_K8S_K8IBDIAE_DEL-ITE-ARC-KAF-HEA-UNK-MEM',
    ],
    [REFUSED, 'INTEROP_K8S_K8IBDIAE_DEL-ITE-ARC-KAF-CON-REF'],
    [CRASH, 'INTEROP_K8S_K8IBDIAE_DEL-ITE-ARC-KAF-RET-EXH'],
    [
      'ERROR - Crash: KafkaJSNumberOfRetriesExceeded: Connection error: connect ECONNREFUSED 10.0.0.10:9098',
      'INTEROP_K8S_K8IBDIAE_DEL-ITE-ARC-KAF-RET-EXH',
    ],
    [COORDINATOR, 'INTEROP_K8S_K8IBDIAE_DEL-ITE-ARC-KAF-WRO-COO'],
  ] as const) {
    it(`recognizes ${expected} without CID: ${message.slice(8, 48)}`, async () => {
      assert.deepStrictEqual((await matchedIds([message]))[0], expected);
    });
  }

  it('reports every error when connection failures, crash and coordinator errors coexist', async () => {
    // Rows without a time keep the declaration order of the cases.
    assert.deepStrictEqual(await matchedIds([REFUSED, CRASH, COORDINATOR]), [
      'INTEROP_K8S_K8IBDIAE_DEL-ITE-ARC-KAF-CON-REF',
      'INTEROP_K8S_K8IBDIAE_DEL-ITE-ARC-KAF-WRO-COO',
      'INTEROP_K8S_K8IBDIAE_DEL-ITE-ARC-KAF-RET-EXH',
    ]);
  });

  it('does not extend production cases to att or test', async () => {
    for (const environment of ['att', 'test']) assert.deepStrictEqual(await matchedIds([HEARTBEAT], environment), []);
  });

  it('does not recognize the heartbeat from CID-only evidence or from similar messages', () => {
    const tracker = podLogRows(alarm.podApp, [JSON.stringify({ log: HEARTBEAT })]);
    assert.deepStrictEqual(
      matchingKnownErrorCodes(
        KNOWN_ERRORS,
        conditionContext([[alarm.stepIds.queryCidTracker, cidTrackerOutput(tracker)]]),
      ),
      [],
    );
    for (const message of [
      'The coordinator is not aware of this member, re-joining the group',
      'ERROR - Response Heartbeat(key: 12, version: 3) - The coordinator is not available',
      'ERROR - Connection error: Client network socket disconnected before secure TLS connection was established',
    ]) {
      const context = conditionContext([[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, [message])]]);
      assert.deepStrictEqual(matchingKnownErrorCodes(KNOWN_ERRORS, context), [], message);
    }
  });
});
