import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PRODUCER_KEYCHAIN_PLATFORMSTATE_WRITER_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../shared/__tests__/helpers/runbookExecution.js';

const CASE_ID = 'producer-keychain-platformstate-writer-kafka-coordinator-unknown-member';
const HEARTBEAT = 'ERROR -  Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member';
const REJOIN =
  'ERROR -  The coordinator is not aware of this member, re-joining the group - The coordinator is not aware of this member';

async function run(
  environment: string,
  messages: ReadonlyArray<string>,
  trackerMessages: ReadonlyArray<string> = [],
): Promise<RunbookLogsExecution> {
  return executeAlarmWithLogs(
    buildRunbook(),
    `${alarm.runbookKey}-${environment}`,
    interopPodResponder({
      podApp: alarm.podApp,
      messages,
      ...(trackerMessages.length === 0 ? {} : { cid: 'traced-cid', trackerMessages }),
    }),
  );
}

describe('producer keychain platformstate writer known cases', () => {
  it('recognizes the heartbeat and the rejoin of an unknown member in prod and att only', async () => {
    for (const messages of [[HEARTBEAT, REJOIN], [HEARTBEAT], [REJOIN]]) {
      for (const environment of ['prod', 'att']) {
        assert.deepStrictEqual((await run(environment, messages)).matchedIds, [CASE_ID], environment);
      }
      assert.deepStrictEqual((await run('test', messages)).matchedIds, []);
    }
  });

  it('does not attribute the Kafka errors traced in another service', async () => {
    const { matchedIds, queries } = await run('prod', ['ERROR - Unknown failure'], [HEARTBEAT]);
    assert.strictEqual(queries.length, 2);
    assert.deepStrictEqual(matchedIds, []);
  });

  it('does not recognize the wrong coordinator errors or the bare rejoin', async () => {
    for (const message of [
      'ERROR -  Response Heartbeat(key: 12, version: 3) - This is not the correct coordinator for this group',
      'ERROR -  Response JoinGroup(key: 11, version: 5) - This is not the correct coordinator for this group',
      'ERROR -  Crash: KafkaJSNonRetriableError: This is not the correct coordinator for this group',
      'ERROR - The coordinator is not aware of this member, re-joining the group',
      'Request failed: Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member',
    ]) {
      assert.deepStrictEqual((await run('prod', [message])).matchedIds, [], message);
    }
  });
});
