import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownCaseTesting.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../shared/__tests__/helpers/runbookExecution.js';
import { matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { CATALOG_PLATFORMSTATE_WRITER_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';
import { buildRunbook } from '../runbook.js';

const NETWORK = 'catalog-platformstate-writer-temporary-network-errors';
const KAFKA = 'catalog-platformstate-writer-kafka-coordinator-member-rejoin';
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

describe('catalog platformstate writer known cases', () => {
  it('recognizes each documented signature in writer logs only, never from CID-only evidence', () => {
    for (const [message, expected] of DOCUMENTED) {
      const rows = podLogRows(alarm.podApp, [message]);
      const application = conditionContext([[alarm.stepIds.queryApplicationLogs, rows]]);
      assert.deepStrictEqual(matchingCaseIds(KNOWN_CASES, application), [expected], message);
      const tracker = conditionContext([[alarm.stepIds.queryCidTracker, cidTrackerOutput(rows)]]);
      assert.deepStrictEqual(matchingCaseIds(KNOWN_CASES, tracker), [], message);
    }
    const unrelated = podLogRows(alarm.podApp, ['The group coordinator is not available']);
    assert.deepStrictEqual(
      matchingCaseIds(KNOWN_CASES, conditionContext([[alarm.stepIds.queryApplicationLogs, unrelated]])),
      [],
    );
  });

  for (const [message, expected] of [
    ['ERROR - Connection error: connect ECONNREFUSED 10.0.38.131:9098', NETWORK],
    [
      'ERROR - Error Consumer crashed {"type":"consumer.crash","payload":{"error":{"name":"KafkaJSNumberOfRetriesExceeded"},"restart":false}}.',
      'catalog-platformstate-writer-kafka-retries-exhausted',
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

  it('keeps the known case read in the error rows and declares the evidence incomplete when the pod context cannot be read', async () => {
    const { result, matchedIds, draft } = await executeAlarmWithLogs(
      buildRunbook(),
      `${alarm.runbookKey}-prod`,
      interopPodResponder({ podApp: alarm.podApp, messages: [COORDINATOR], failContext: true }),
    );
    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(matchedIds, ['catalog-platformstate-writer-kafka-coordinator-member-rejoin']);
    assert.deepStrictEqual(
      result.coverage.map(({ complete, reason }) => ({ complete, reason })),
      [{ complete: false, reason: 'unavailable' }],
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.match(draft.conclusionNotes, /Evidenza incompleta: 1 fonti \(non disponibili 1\)/u);
  });
});
