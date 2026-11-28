import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { M2M_TOKEN_DETAILS_PERSISTER_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../shared/__tests__/helpers/runbookExecution.js';

const CASE_ID = 'INTEROP_K8S_K8IBM2TDPE_M2M-TOK-DET-PER-KAF-COO-MEM-REJ';
const TIMEOUT_CASE_ID = 'INTEROP_K8S_K8IBM2TDPE_M2M-TOK-DET-PER-KAF-OFF-COM-TIM';
const REJOIN = 'ERROR - The coordinator is not aware of this member, re-joining the group';
const OFFSET_COMMIT_UNKNOWN_MEMBER =
  'ERROR -  Response OffsetCommit(key: 8, version: 5) - The coordinator is not aware of this member';
const OFFSET_COMMIT_TIMEOUT = 'ERROR -  Response OffsetCommit(key: 8, version: 5) - The request timed out';

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

describe('m2m token details persister known errors', () => {
  it('recognizes the documented Kafka rejoin among the offset commit errors', async () => {
    const messages = [
      OFFSET_COMMIT_UNKNOWN_MEMBER,
      OFFSET_COMMIT_UNKNOWN_MEMBER,
      'ERROR -  The coordinator is not aware of this member, re-joining the group - The coordinator is not aware of this member',
    ];
    assert.deepStrictEqual((await run('prod', messages)).matchedIds, [CASE_ID]);
  });

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

  it('recognizes the offset commit timeout in prod only', async () => {
    assert.deepStrictEqual(
      (
        await run(
          'prod',
          Array.from({ length: 5 }, () => OFFSET_COMMIT_TIMEOUT),
        )
      ).matchedIds,
      [TIMEOUT_CASE_ID],
    );
    for (const environment of ['att', 'test']) {
      assert.deepStrictEqual((await run(environment, [OFFSET_COMMIT_TIMEOUT])).matchedIds, [], environment);
    }
    const traced = await run('prod', ['ERROR - Unknown failure'], [OFFSET_COMMIT_TIMEOUT]);
    assert.deepStrictEqual(traced.matchedIds, []);
  });

  it('does not recognize undocumented Kafka errors', async () => {
    for (const message of [
      OFFSET_COMMIT_UNKNOWN_MEMBER,
      'ERROR -  Response Heartbeat(key: 12, version: 3) - The request timed out',
      'ERROR -  Connection error: connect ECONNREFUSED 10.0.37.158:9098',
      'ERROR -  Crash: KafkaJSNumberOfRetriesExceeded: Connection error: connect ECONNREFUSED 10.0.37.158:9098',
      'ERROR -  Response Heartbeat(key: 12, version: 3) - This is not the correct coordinator for this group',
      'Request failed: The coordinator is not aware of this member, re-joining the group',
    ]) {
      assert.deepStrictEqual((await run('prod', [message])).matchedIds, [], message);
    }
  });
});
