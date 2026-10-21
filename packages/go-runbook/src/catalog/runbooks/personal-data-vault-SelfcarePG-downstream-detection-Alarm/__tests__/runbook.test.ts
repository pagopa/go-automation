import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOLogger } from '@go-automation/go-common/core';
import type { ResultField } from '@go-automation/go-common/aws';

import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { buildRunbook } from '../runbook.js';

const ENDPOINT = 'https://api.selfcare.pagopa.it/external/data-vault/v1/pn-pg/institutions/add';
const HTTP_500 = `[DOWNSTREAM] Service SelfcarePG returned errors=500 Internal Server Error from POST ${ENDPOINT}`;
const TRACE_ID = '1-6a998383-6af3ccaf345f6ec60aa6e431';

function row(message: string): ReadonlyArray<ResultField> {
  return [
    { field: '@timestamp', value: '2026-09-03T14:30:35.262Z' },
    { field: 'level', value: 'ERROR' },
    { field: 'trace_id', value: TRACE_ID },
    { field: 'message', value: message },
    { field: '@message', value: JSON.stringify({ level: 'ERROR', message, trace_id: TRACE_ID }) },
  ];
}

async function execute(
  message: string,
  traceMessage = '',
): Promise<{
  result: RunbookExecutionResult;
  queries: string[];
  draft: ReturnType<typeof buildAnalysisDraft>;
}> {
  const queries: string[] = [];
  const runbook = buildRunbook();
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['startTime', '2026-09-03T14:07:30Z'],
      ['endTime', '2026-09-03T14:42:30Z'],
    ]),
    createTestServiceRegistry({
      cloudWatchLogs: {
        // eslint-disable-next-line @typescript-eslint/require-await
        async queryWithStatistics(groups: ReadonlyArray<string>, query: string) {
          assert.deepStrictEqual(groups, ['/aws/ecs/pn-data-vault-sep']);
          queries.push(query);
          const rows = queries.length === 1 ? [row(message)] : traceMessage === '' ? [] : [row(traceMessage)];
          return {
            rows,
            statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
            queryExecutions: [],
          };
        },
      },
    }),
  );
  return { result, queries, draft: buildAnalysisDraft(runbook, result) };
}

describe('personal-data-vault SelfcarePG runbook', () => {
  it('keeps the documented time window, verified log group and page reference', () => {
    const runbook = buildRunbook();
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 30, afterMinutes: 5 });
    assert.ok(runbook.analysisDefaults?.links?.some(({ url }) => url.includes('/2405990619/')));
  });

  it('recognizes the observed HTTP 500 without declaring recovery', async () => {
    const { result, queries, draft } = await execute(`${HTTP_500};{"status":500}`);
    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['selfcarepg-institutions-add-http-500'],
    );
    assert.strictEqual(queries.length, 1);
    assert.match(queries[0] ?? '', /level = 'ERROR'/);
    assert.ok(queries[0]?.includes("message like '[DOWNSTREAM] Service SelfcarePG returned errors='"));
    assert.ok(draft?.kind === 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(draft?.conclusionNotes, 'Risoluzione non documentata.');
    assert.deepStrictEqual(draft?.finalActions, []);
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
      assert.deepStrictEqual(result.matchedCases, []);
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
    assert.ok(known.queries[1]?.includes(TRACE_ID));
    assert.ok(known.draft?.kind === 'KNOWN_CASE');
    assert.strictEqual(known.draft.proposedStatus, 'IN_PROGRESS');
  });
});
