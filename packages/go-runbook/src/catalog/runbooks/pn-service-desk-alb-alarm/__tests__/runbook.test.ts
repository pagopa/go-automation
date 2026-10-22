import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOLogger } from '@go-automation/go-common/core';
import type { ResultField } from '@go-automation/go-common/aws';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { buildRunbook } from '../runbook.js';

const TRACE_ID = '1-6ac782cf-29dda2b21b4f9db14013b7a0';
const HOST = 'http://internal-lb.example:8080';
const NOT_FOUND = `[AUD_CA_VIEW_NOTIFICATION] FAILURE - errorReason = 404 Not Found from GET ${HOST}/delivery-private/notifications/TEST-IUN, An error occurred while calling the service to obtain sent notifications`;
const GONE = `errorReason = 410 Gone from GET ${HOST}/delivery-private/notifications/received/TEST-IUN/attachments/documents/0, An error occurred while calling the service to obtain notification document`;
type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;

function row(message: string): ReadonlyArray<ResultField> {
  return [
    { field: 'level', value: 'ERROR' },
    { field: 'message', value: message },
    { field: 'trace_id', value: TRACE_ID },
    { field: '@message', value: JSON.stringify({ message, trace_id: TRACE_ID, level: 'ERROR' }) },
  ];
}

async function execute(
  errors: Rows,
  flow: Rows = [],
  denied = false,
): Promise<{
  result: RunbookExecutionResult;
  queries: string[];
}> {
  const queries: string[] = [];
  const result = await new RunbookEngine(new GOLogger()).execute(
    buildRunbook(),
    new Map([
      ['startTime', '2026-10-08T11:45:33Z'],
      ['endTime', '2026-10-08T11:55:33Z'],
    ]),
    createTestServiceRegistry({
      cloudWatchLogs: {
        forTarget() {
          assert.fail('Runbooks must use the injected service without replacing its execution target');
        },
        // eslint-disable-next-line @typescript-eslint/require-await
        async queryWithStatistics(
          groups: ReadonlyArray<string>,
          query: string,
          _range: unknown,
          options: { logGroupResolutionMode?: string },
        ) {
          assert.deepStrictEqual(groups, ['/aws/ecs/pn-service-desk']);
          assert.strictEqual(options.logGroupResolutionMode, 'search-configured-profiles');
          if (denied) throw new Error('AccessDeniedException');
          queries.push(query);
          const rows = queries.length === 1 ? errors : flow;
          return {
            rows,
            statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
            queryExecutions: [],
          };
        },
      },
    }),
  );
  return { result, queries };
}

describe('service desk runbook with injected AWS services', () => {
  it('uses the canonical service pipeline without account or profile overrides', () => {
    const runbook = buildRunbook();
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 5 });
    assert.deepStrictEqual(
      runbook.steps.map(({ step }) => step.id),
      ['prepare-service-section', 'query-pn-service-desk', 'analyze-pn-service-desk', 'query-pn-service-desk-trace'],
    );
  });
  it('recognizes the documented 404 through the injected reader', async () => {
    const { result } = await execute([row(NOT_FOUND)]);
    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['service-desk-view-notification-not-found'],
    );
    assert.strictEqual(result.matchedCases[0]?.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(result.finalContext.vars.get('serviceDeskTraceId'), TRACE_ID);
  });
  it('recognizes the 410 signature and reuses the same reader and trace for correlation', async () => {
    const { result, queries } = await execute(
      [row('[AUD_CA_DOC_AVAILABLE] FAILURE - errorReason = See logs for details in PN-SERVICE-DESK')],
      [row(GONE)],
    );
    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(queries.length, 2);
    assert.ok(queries[1]?.includes(TRACE_ID));
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['service-desk-notification-document-gone'],
    );
    assert.strictEqual(result.matchedCases[0]?.analysis?.resolution, 'Risoluzione non documentata.');
  });
  it('does not classify generic audit errors, other 404s or other document statuses', async () => {
    for (const message of [
      '[AUD_CA_DOC_AVAILABLE] FAILURE',
      NOT_FOUND.replace('AUD_CA_VIEW_NOTIFICATION', 'OTHER_AUDIT'),
      GONE.replace('410 Gone', '500 Internal Server Error'),
    ]) {
      const { result } = await execute([row(message)]);
      assert.deepStrictEqual(result.matchedCases, []);
    }
  });
  it('surfaces an inaccessible configured source without falling back to a hardcoded account', async () => {
    const { result } = await execute([row(NOT_FOUND)], [], true);
    assert.strictEqual(result.status, 'failed');
    assert.deepStrictEqual(result.matchedCases, []);
  });
});
