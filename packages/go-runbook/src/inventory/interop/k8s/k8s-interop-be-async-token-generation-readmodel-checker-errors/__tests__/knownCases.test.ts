import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownCaseTesting.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../shared/__tests__/helpers/runbookExecution.js';
import { matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { ASYNC_TOKEN_GENERATION_READMODEL_CHECKER_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';
import { buildRunbook } from '../runbook.js';

const CASE_ID = 'async-token-generation-catalog-platform-states-difference';
const MESSAGE =
  'Differences in platform-states when checking catalog entry ' +
  'ESERVICEDESCRIPTOR#2d9d036e-7d4a-4634-8506-ea8ed67b291c#755022d4-cfad-4da9-b188-187c4c4743c9';
const PREFIX = '2026-10-12T10:00:00.000Z ERROR [async-token-generation-readmodel-checker] - ';

function matches(message: string): ReadonlyArray<string> {
  const rows = podLogRows(alarm.podApp, [`${PREFIX}${message}`]);
  return matchingCaseIds(KNOWN_CASES, conditionContext([[alarm.stepIds.queryApplicationLogs, rows]], 'att'));
}

describe('async token generation readmodel checker known case', () => {
  it('recognizes the documented catalog difference in an Att execution without CID', async () => {
    const { matchedIds } = await executeAlarmWithLogs(
      buildRunbook(),
      `${alarm.runbookKey}-att`,
      interopPodResponder({ podApp: alarm.podApp, messages: [`${PREFIX}${MESSAGE}`] }),
    );
    assert.deepStrictEqual(matchedIds, [CASE_ID]);
  });

  it('recognizes other valid catalog identifiers, in either case', () => {
    const message = MESSAGE.replace(
      '2d9d036e-7d4a-4634-8506-ea8ed67b291c',
      '11111111-2222-3333-4444-555555555555',
    ).replace('755022d4-cfad-4da9-b188-187c4c4743c9', 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE');
    assert.deepStrictEqual(matches(message), [CASE_ID]);
  });

  it('does not assign a catalog difference traced in another service to the checker', async () => {
    const { matchedIds } = await executeAlarmWithLogs(
      buildRunbook(),
      `${alarm.runbookKey}-att`,
      interopPodResponder({
        podApp: alarm.podApp,
        messages: [`${PREFIX}Unknown checker error`],
        cid: 'checker-cid',
        trackerMessages: [`${PREFIX}${MESSAGE}`],
        trackerPodApp: 'interop-be-token-generation-readmodel-checker',
      }),
    );
    assert.deepStrictEqual(matchedIds, []);
  });

  it('leaves other entities, incomplete keys, invalid suffixes and Jira-only messages unknown', () => {
    for (const message of [
      MESSAGE.replace('ESERVICEDESCRIPTOR', 'AGREEMENT'),
      MESSAGE.slice(0, -1),
      `${MESSAGE}0`,
      `${MESSAGE}-extra`,
      `${MESSAGE}#extra`,
      'Differences in platform-states when checking catalog entry ESERVICEDESCRIPTOR#invalid#invalid',
      'Unexpected producer-keychain-platform-states entry PRODUCERKEYCHAINKIDESERVICE#11111111-2222-3333-4444-555555555555',
    ]) {
      assert.deepStrictEqual(matches(message), [], message);
    }
  });
});
