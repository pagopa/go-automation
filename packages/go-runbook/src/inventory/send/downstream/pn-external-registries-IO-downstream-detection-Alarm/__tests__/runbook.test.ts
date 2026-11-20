import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SEND_DOWNSTREAMS } from '../../../../../toolkits/send/index.js';
import { buildRunbook } from '../runbook.js';
import { executeWithLogs } from '../../../../../__tests__/helpers/executeWithLogs.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';

const TRACE_ID = '1-69bd2170-e25ad8375848680f6a33bd33';

/** Runs the runbook: the error scan returns `message`, the trace query nothing. */
async function execute(message: string): Promise<RunbookLogsExecution> {
  return executeWithLogs(
    buildRunbook(),
    { startTime: '2026-09-07T09:30:00.000Z', endTime: '2026-09-07T10:05:00.000Z' },
    (_query, [group], _timeRange, index) => {
      assert.strictEqual(group, '/aws/ecs/pn-external-registries');
      return index === 0 ? [logRow({ level: 'ERROR', message, trace_id: TRACE_ID })] : [];
    },
  );
}

describe('external-registries IO downstream runbook', () => {
  it('runs q2 for an unknown error carrying a trace, then uses the standard fallback', async () => {
    const { result, queries, draft } = await execute('[DOWNSTREAM] Service IO returned errors=429 Too Many Requests');

    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.stepsExecuted, 4);
    assert.deepStrictEqual(result.detections, []);
    assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    assert.strictEqual(queries.length, 2);
    assert.ok(queries[1]?.query.includes(`@message like '${TRACE_ID}'`));
  });

  it('recognizes a known timeout, still reads its trace and does not claim recovery', async () => {
    const { result, queries } = await execute(
      '[DOWNSTREAM] Service IO returned errors=io.netty.handler.timeout.ReadTimeoutException',
    );

    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.stepsExecuted, 4);
    assert.strictEqual(queries.length, 2);
    assert.ok(queries[1]?.query.includes(`@message like '${TRACE_ID}'`));
    assert.strictEqual(result.detections[0]?.knownCase.id, 'io-read-timeout');
  });

  it('publishes the courtesy timeline checks for the documented JSON failure without proposing closure', async () => {
    const { draft } = await execute(
      `[DOWNSTREAM] Service IO returned errors=500 Internal Server Error from POST ` +
        `https://api.io.pagopa.it/api/v1/messages;${JSON.stringify({
          detail:
            'invalid json response body at https://api-app.internal.io.pagopa.it/api/v1/messages-sending/' +
            'remote-contents/configurations/01HMVMHCZZ8D0VTFWMRHBM5D6F reason: Unexpected end of JSON input',
          status: 500,
          title: 'Internal server error',
        })}`,
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(draft.downstreams, [SEND_DOWNSTREAMS.APP_IO]);
    assert.ok(draft.links.some(({ url }) => url === 'https://pagopa.atlassian.net/browse/PN-21426'));
  });

  it('leaves the unverified Micrometer addition unclassified', async () => {
    const { draft } = await execute(
      '[DOWNSTREAM] Service IO returned errors=Unable to find a meter that matches all the requirements at once. NumberOfIOMessageSentSuccessfully',
    );
    assert.notStrictEqual(draft?.kind, 'KNOWN_CASE');
  });
});
