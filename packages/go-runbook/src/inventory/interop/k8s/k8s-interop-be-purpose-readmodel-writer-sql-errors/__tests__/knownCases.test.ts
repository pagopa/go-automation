import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PURPOSE_READMODEL_WRITER_SQL_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../shared/__tests__/helpers/runbookExecution.js';

const CASE_ID = 'purpose-readmodel-writer-sql-kafka-coordinator-member-rejoin';
const REJOIN = 'ERROR - The coordinator is not aware of this member, re-joining the group';

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

describe('purpose readmodel writer SQL known cases', () => {
  it('recognizes the documented Kafka rejoin in prod only', async () => {
    for (const message of [REJOIN, `${REJOIN} - The coordinator is not aware of this member`]) {
      assert.deepStrictEqual((await run('prod', [message])).matchedIds, [CASE_ID], message);
      for (const environment of ['att', 'test']) {
        assert.deepStrictEqual((await run(environment, [message])).matchedIds, [], environment);
      }
    }
  });

  it('does not attribute a rejoin traced in another service', async () => {
    const { matchedIds, queries } = await run('prod', ['ERROR - Unknown failure'], [REJOIN]);
    assert.strictEqual(queries.length, 2);
    assert.deepStrictEqual(matchedIds, []);
  });

  it('does not recognize the Kafka errors of the MSK maintenance', async () => {
    for (const message of [
      'ERROR -  Connection error: connect ECONNREFUSED 10.0.37.158:9098',
      'ERROR -  Crash: KafkaJSNumberOfRetriesExceeded: Connection error: connect ECONNREFUSED 10.0.37.158:9098',
      'ERROR -  Response Heartbeat(key: 12, version: 3) - This is not the correct coordinator for this group',
      'Request failed: The coordinator is not aware of this member, re-joining the group',
    ]) {
      assert.deepStrictEqual((await run('prod', [message])).matchedIds, [], message);
    }
  });
});
