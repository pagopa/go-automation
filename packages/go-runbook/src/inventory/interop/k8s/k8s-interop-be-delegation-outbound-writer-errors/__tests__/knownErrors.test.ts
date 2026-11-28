import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOLogger } from '@pagopa/go-common/logging';

import { executeRunbookForOccurrence } from '../../../../../runtime/index.js';
import { createTestServiceRegistry } from '../../../../../toolkits/interop/index.js';
import { cidTrackerOutput, conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownErrorTesting.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../shared/__tests__/helpers/runbookExecution.js';
import { fakeCloudWatchLogs } from '../../../../../__tests__/helpers/fakeCloudWatchLogs.js';
import { matchingKnownErrorCodes } from '../../../../../__tests__/helpers/knownErrorMatching.js';
import { DELEGATION_OUTBOUND_WRITER_ALARM as alarm } from '../alarmDefinition.js';
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

describe('delegation outbound writer known errors', () => {
  for (const [message, expected] of [
    [HEARTBEAT, 'INTEROP_K8S_K8IBDOWE_DEL-OUT-WRI-KAF-HEA-UNK-MEM'],
    [HEARTBEAT.replace('version: 3', 'version: 4'), 'INTEROP_K8S_K8IBDOWE_DEL-OUT-WRI-KAF-HEA-UNK-MEM'],
    [
      'ERROR - The coordinator is not aware of this member, re-joining the group',
      'INTEROP_K8S_K8IBDOWE_DEL-OUT-WRI-KAF-HEA-UNK-MEM',
    ],
    [REFUSED, 'INTEROP_K8S_K8IBDOWE_DEL-OUT-WRI-KAF-CON-REF'],
    [CRASH, 'INTEROP_K8S_K8IBDOWE_DEL-OUT-WRI-KAF-RET-EXH'],
    [
      'ERROR - Crash: KafkaJSNumberOfRetriesExceeded: Connection error: connect ECONNREFUSED 10.0.0.10:9098',
      'INTEROP_K8S_K8IBDOWE_DEL-OUT-WRI-KAF-RET-EXH',
    ],
    [COORDINATOR, 'INTEROP_K8S_K8IBDOWE_DEL-OUT-WRI-KAF-WRO-COO'],
    [
      'ERROR - Response JoinGroup(key: 11, version: 5) - This is not the correct coordinator for this group',
      'INTEROP_K8S_K8IBDOWE_DEL-OUT-WRI-KAF-WRO-COO',
    ],
  ] as const) {
    it(`recognizes ${expected} without CID: ${message.slice(8, 48)}`, async () => {
      assert.deepStrictEqual((await matchedIds([message]))[0], expected);
    });
  }

  it('reports every error when connection failures, crash and coordinator errors coexist', async () => {
    // Rows without a time keep the declaration order of the cases.
    assert.deepStrictEqual(await matchedIds([REFUSED, CRASH, COORDINATOR]), [
      'INTEROP_K8S_K8IBDOWE_DEL-OUT-WRI-KAF-CON-REF',
      'INTEROP_K8S_K8IBDOWE_DEL-OUT-WRI-KAF-WRO-COO',
      'INTEROP_K8S_K8IBDOWE_DEL-OUT-WRI-KAF-RET-EXH',
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
