import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOLogger } from '@pagopa/go-common/logging';

import { executeRunbookForOccurrence } from '../../../../../runtime/index.js';
import { createTestServiceRegistry } from '../../../../../toolkits/interop/index.js';
import { cidTrackerOutput, conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownCaseTesting.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../shared/__tests__/helpers/runbookExecution.js';
import { fakeCloudWatchLogs } from '../../../../../__tests__/helpers/fakeCloudWatchLogs.js';
import { matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { DELEGATION_OUTBOUND_WRITER_ALARM as alarm } from '../alarmDefinition.js';
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

describe('delegation outbound writer known cases', () => {
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
    [
      'ERROR - Response JoinGroup(key: 11, version: 5) - This is not the correct coordinator for this group',
      'wrong-coordinator',
    ],
  ] as const) {
    it(`recognizes ${expected} without CID: ${message.slice(8, 48)}`, async () => {
      assert.deepStrictEqual((await matchedIds([message]))[0], `delegation-outbound-writer-kafka-${expected}`);
    });
  }

  it('reports every error when connection failures, crash and coordinator errors coexist', async () => {
    // Rows without a time keep the declaration order of the cases.
    assert.deepStrictEqual(await matchedIds([REFUSED, CRASH, COORDINATOR]), [
      'delegation-outbound-writer-kafka-connection-refused',
      'delegation-outbound-writer-kafka-wrong-coordinator',
      'delegation-outbound-writer-kafka-retries-exhausted',
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

  it('exports every pod context row, early restart signals included, in the serialized cloud occurrence', async () => {
    const contextMessages = [
      'WARN - Error during restart service',
      'INFO - The coordinator is not aware of this member, re-joining the group',
      'INFO - Consumer has joined the group',
      ...Array.from({ length: 6 }, () => HEARTBEAT),
    ];
    const cloudWatchLogs = fakeCloudWatchLogs(
      interopPodResponder({ podApp: alarm.podApp, messages: [HEARTBEAT], contextMessages }),
    );
    const output = await executeRunbookForOccurrence(
      { logger: new GOLogger(), services: createTestServiceRegistry({ cloudWatchLogs }) },
      {
        alarmName: `${alarm.runbookKey}-prod`,
        firedAt: '2026-10-06T18:00:08Z',
        awsAccountId: '123456789012',
        region: 'eu-south-1',
        awsProfiles: [],
        executionMode: 'cloud',
      },
    );
    const serialized = JSON.parse(JSON.stringify(output)) as typeof output;
    const evidence = serialized.context.evidence.find(
      ({ sourceStep }) => sourceStep === 'query-delegation-outbound-writer-context',
    );
    assert.ok(evidence, 'missing outbound-writer context evidence in the occurrence result');
    assert.strictEqual(evidence.type, 'log-sample');
    assert.strictEqual(evidence.truncated, false);
    assert.deepStrictEqual(
      evidence.items?.map(({ message }) => message),
      contextMessages,
    );
    assert.deepStrictEqual(
      evidence.items?.map((item) => item['@message']),
      contextMessages.map((log) => JSON.stringify({ log, pod_app: alarm.podApp, stream: 'stderr' })),
    );
    assert.strictEqual(serialized.analysis?.kind, 'KNOWN_CASE');
  });
});
