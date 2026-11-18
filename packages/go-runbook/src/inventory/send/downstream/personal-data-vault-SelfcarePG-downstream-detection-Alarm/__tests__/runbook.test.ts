import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildRunbook } from '../runbook.js';
import { executeWithLogs } from '../../../../../__tests__/helpers/executeWithLogs.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';

const ENDPOINT = 'https://api.selfcare.pagopa.it/external/data-vault/v1/pn-pg/institutions/add';
const HTTP_500 = `[DOWNSTREAM] Service SelfcarePG returned errors=500 Internal Server Error from POST ${ENDPOINT}`;
const TRACE_ID = '1-6a998383-6af3ccaf345f6ec60aa6e431';

function row(message: string): ReturnType<typeof logRow> {
  return logRow({
    level: 'ERROR',
    trace_id: TRACE_ID,
    message,
    '@message': JSON.stringify({ level: 'ERROR', message, trace_id: TRACE_ID }),
  });
}

/** Runs the runbook: the error scan returns `message`, the trace query `traceMessage` (if any). */
async function execute(message: string, traceMessage = ''): Promise<RunbookLogsExecution> {
  return executeWithLogs(
    buildRunbook(),
    { startTime: '2026-09-03T14:07:30Z', endTime: '2026-09-03T14:42:30Z' },
    (_query, [group], _timeRange, index) => {
      assert.strictEqual(group, '/aws/ecs/pn-data-vault-sep');
      if (index === 0) return [row(message)];
      return traceMessage === '' ? [] : [row(traceMessage)];
    },
  );
}

describe('personal-data-vault SelfcarePG runbook', () => {
  it('recognizes the observed HTTP 500 without declaring recovery', async () => {
    const { result, queries, draft } = await execute(`${HTTP_500};{"status":500}`);
    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['selfcarepg-institutions-add-http-500'],
    );
    assert.strictEqual(queries.length, 1);
    assert.ok(draft?.kind === 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(draft.conclusionNotes, 'Risoluzione non documentata.');
    assert.deepStrictEqual(draft.finalActions, []);
    assert.strictEqual(result.finalContext.vars.get('dataVaultTraceId'), TRACE_ID);
  });

  it('does not generalize the observed HTTP 500 to other statuses, services or endpoints', async () => {
    for (const message of [
      HTTP_500.replace('500 Internal Server Error', '503 Service Unavailable'),
      HTTP_500.replace('POST', 'GET'),
      HTTP_500.replace('api.selfcare.pagopa.it', 'other.example'),
      `${HTTP_500}itional`,
      HTTP_500.replace('SelfcarePG', 'AnotherService'),
    ]) {
      const { result } = await execute(message);
      assert.deepStrictEqual(result.matchedCases, [], message);
    }
  });

  it('requires the correlated timeout evidence for an empty downstream error', async () => {
    const message = '[DOWNSTREAM] Service SelfcarePG returned errors=';
    const unknown = await execute(message);
    assert.deepStrictEqual(unknown.result.matchedCases, []);
    const known = await execute(message, 'io.netty.handler.timeout.ReadTimeoutException: null');
    assert.deepStrictEqual(
      known.result.matchedCases.map(({ id }) => id),
      ['selfcarepg-read-timeout-with-empty-error'],
    );
    assert.ok(known.queries[1]?.query.includes(TRACE_ID));
    assert.ok(known.draft?.kind === 'KNOWN_CASE');
    assert.strictEqual(known.draft.proposedStatus, 'IN_PROGRESS');
  });
});
