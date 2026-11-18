import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../__tests__/helpers/knownCaseTesting.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../__tests__/helpers/runbookExecution.js';
import { matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { M2M_EVENT_DISPATCHER_ALARM as ALARM } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';
import { buildRunbook } from '../runbook.js';

const REFUSED = 'ERROR - Connection error: connect ECONNREFUSED broker:9098';

function matches(messages: ReadonlyArray<string>, trackerMessages: ReadonlyArray<string> = []): ReadonlyArray<string> {
  const context = conditionContext([
    [ALARM.stepIds.queryApplicationLogs, podLogRows(ALARM.podApp, messages)],
    [ALARM.stepIds.queryCidTracker, cidTrackerOutput(podLogRows('interop-be-another-service', trackerMessages))],
  ]);
  return matchingCaseIds(KNOWN_CASES, context);
}

describe('M2M event dispatcher known cases', () => {
  it('recognizes the documented connection and member signatures, also JSON-encoded', () => {
    for (const [message, expected] of [
      ['ERROR - Connection timeout', 'm2m-connection-timeout-tls'],
      [
        'ERROR - Connection error: Client network socket disconnected before secure TLS connection was established',
        'm2m-connection-timeout-tls',
      ],
      ['Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member', 'm2m-member-rejoin'],
      [JSON.stringify({ log: 'The coordinator is not aware of this member' }), 'm2m-member-rejoin'],
    ] as const) {
      assert.deepStrictEqual(matches([message]), [expected], message);
    }
  });

  it('recognizes the actual incident signatures and prioritizes the crash over connection failures', () => {
    assert.deepStrictEqual(
      matches([
        REFUSED,
        'ERROR - Crash: KafkaJSNumberOfRetriesExceeded: Connection error: connect ECONNREFUSED broker:9098',
        'ERROR - Error Consumer crashed {"type":"consumer.crash","payload":{"restart":false}}.',
        'ERROR - Response Heartbeat(key: 12, version: 3) - This is not the correct coordinator for this group',
      ]),
      ['m2m-consumer-crash', 'm2m-connection-refused', 'm2m-wrong-coordinator'],
    );
  });

  it('does not match a dispatcher case from another service sharing the same CID', () => {
    const tracker = [
      'Crash: KafkaJSNumberOfRetriesExceeded',
      'Error Consumer crashed',
      'Connection error: connect ECONNREFUSED broker:9098',
      'This is not the correct coordinator for this group',
      'The coordinator is not aware of this member',
      'Connection timeout',
      'Connection error: Client network socket disconnected before secure TLS connection was established',
    ];
    assert.deepStrictEqual(matches([], tracker), []);
    assert.deepStrictEqual(matches(['ERROR - Unrecognized dispatcher error'], tracker), []);
    assert.deepStrictEqual(matches([REFUSED], ['ERROR - Crash: KafkaJSNumberOfRetriesExceeded']), [
      'm2m-connection-refused',
    ]);
  });

  it('does not infer a known case or maintenance from tokens or unrelated errors', () => {
    assert.deepStrictEqual(
      matches(['AWS authentication token obtained', 'Request timeout', 'AccessDenied', 'MSK Kafka security patching']),
      [],
    );
  });

  it('queries the production namespace of the dispatcher', async () => {
    const { matchedIds, queries } = await executeAlarmWithLogs(
      buildRunbook(),
      ALARM.runbookKey,
      interopPodResponder({ podApp: ALARM.podApp, messages: [REFUSED] }),
    );
    assert.deepStrictEqual(matchedIds, ['m2m-connection-refused']);
    assert.match(queries[0]?.query ?? '', /filter pod_namespace = "prod"/u);
    assert.ok(queries[0]?.query.includes(ALARM.podApp.replaceAll('-', '\\-')));
  });
});
