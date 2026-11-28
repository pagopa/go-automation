import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownErrorTesting.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../shared/__tests__/helpers/runbookExecution.js';
import { matchingKnownErrorCodes } from '../../../../../__tests__/helpers/knownErrorMatching.js';
import { CATALOG_PLATFORMSTATE_WRITER_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_ERRORS } from '../knownErrors.js';
import { buildRunbook } from '../runbook.js';

const NETWORK = 'INTEROP_K8S_K8IBCPWE_CAT-PLA-WRI-TEM-NET-ERR';
const KAFKA = 'INTEROP_K8S_K8IBCPWE_CAT-PLA-WRI-KAF-COO-MEM-REJ';
const COORDINATOR =
  'ERROR - Response Heartbeat(key: 12, version: 3) - This is not the correct coordinator for this group';

const DOCUMENTED: ReadonlyArray<readonly [string, string]> = [
  ['ERROR - Connection timeout', NETWORK],
  [
    'ERROR -  Connection error: Client network socket disconnected before secure TLS connection was established',
    NETWORK,
  ],
  ['Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member', KAFKA],
  [
    'The coordinator is not aware of this member, re-joining the group - The coordinator is not aware of this member',
    KAFKA,
  ],
];

describe('catalog platformstate writer known errors', () => {
  it('recognizes each documented signature in writer logs only, never from CID-only evidence', () => {
    for (const [message, expected] of DOCUMENTED) {
      const rows = podLogRows(alarm.podApp, [message]);
      const application = conditionContext([[alarm.stepIds.queryApplicationLogs, rows]]);
      assert.deepStrictEqual(matchingKnownErrorCodes(KNOWN_ERRORS, application), [expected], message);
      const tracker = conditionContext([[alarm.stepIds.queryCidTracker, cidTrackerOutput(rows)]]);
      assert.deepStrictEqual(matchingKnownErrorCodes(KNOWN_ERRORS, tracker), [], message);
    }
    const unrelated = podLogRows(alarm.podApp, ['The group coordinator is not available']);
    assert.deepStrictEqual(
      matchingKnownErrorCodes(KNOWN_ERRORS, conditionContext([[alarm.stepIds.queryApplicationLogs, unrelated]])),
      [],
    );
  });

  for (const [message, expected] of [
    ['ERROR - Connection error: connect ECONNREFUSED 10.0.38.131:9098', NETWORK],
    [
      'ERROR - Error Consumer crashed {"type":"consumer.crash","payload":{"error":{"name":"KafkaJSNumberOfRetriesExceeded"},"restart":false}}.',
      'INTEROP_K8S_K8IBCPWE_CAT-PLA-WRI-KAF-RET-EXH',
    ],
    [COORDINATOR, KAFKA],
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

  it('does not extend production known errors to test or att', async () => {
    for (const environment of ['test', 'att']) {
      const { matchedIds } = await executeAlarmWithLogs(
        buildRunbook(),
        `${alarm.runbookKey}-${environment}`,
        interopPodResponder({ podApp: alarm.podApp, messages: [COORDINATOR] }),
      );
      assert.deepStrictEqual(matchedIds, []);
    }
  });

  it('keeps the known error read in the error rows and declares the evidence incomplete when the pod context cannot be read', async () => {
    const { result, matchedIds, draft } = await executeAlarmWithLogs(
      buildRunbook(),
      `${alarm.runbookKey}-prod`,
      interopPodResponder({ podApp: alarm.podApp, messages: [COORDINATOR], failContext: true }),
    );
    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(matchedIds, ['INTEROP_K8S_K8IBCPWE_CAT-PLA-WRI-KAF-COO-MEM-REJ']);
    assert.deepStrictEqual(
      result.coverage.map(({ complete, reason }) => ({ complete, reason })),
      [{ complete: false, reason: 'unavailable' }],
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.match(draft.conclusionNotes, /Evidenza incompleta: 1 fonti \(non disponibili 1\)/u);
  });
});
