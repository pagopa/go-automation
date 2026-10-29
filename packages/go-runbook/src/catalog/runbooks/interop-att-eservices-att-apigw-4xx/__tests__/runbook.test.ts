import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { computeRunbookTimeRange } from '../../../computeRunbookTimeRange.js';
import { ALARM_NAME, API_GW_ID, API_GW_LOG_GROUP } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';
import { buildRunbook } from '../runbook.js';

function row(overrides: Readonly<Record<string, string>> = {}): ReadonlyArray<ResultField> {
  return Object.entries({
    apigwId: API_GW_ID,
    status: '403',
    httpMethod: 'GET',
    requestPath: '/',
    integrationStatus: '-',
    integrationError: '-',
    ...overrides,
  }).map(([field, value]) => ({ field, value }));
}

interface TestExecution {
  readonly result: RunbookExecutionResult;
  readonly draft: ReturnType<typeof buildAnalysisDraft>;
  readonly queries: ReadonlyArray<string>;
}

async function execute(rows: ReadonlyArray<ReadonlyArray<ResultField>>, failure = false): Promise<TestExecution> {
  const queries: string[] = [];
  const runbook = buildRunbook();
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['alarmName', ALARM_NAME],
      ['startTime', '2026-10-29T04:36:26.000Z'],
      ['endTime', '2026-10-29T04:42:26.000Z'],
    ]),
    createTestServiceRegistry({
      cloudWatchLogs: {
        async queryWithStatistics(
          groups: ReadonlyArray<string>,
          query: string,
          _range: unknown,
          options?: { readonly logGroupResolutionMode?: string; readonly paginateResults?: boolean },
        ): Promise<AWSCloudWatchLogsQueryResult> {
          await Promise.resolve();
          assert.deepEqual(groups, [API_GW_LOG_GROUP]);
          assert.equal(options?.logGroupResolutionMode, 'search-configured-profiles');
          assert.equal(options?.paginateResults, true);
          queries.push(query);
          if (failure) throw new Error('AccessDenied');
          return {
            rows,
            statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
            queryExecutions: [],
          };
        },
      },
    }),
  );
  return { result, draft: buildAnalysisDraft(runbook, result), queries };
}

describe('Attestazione e-services API Gateway 4xx runbook', () => {
  it('registers only the documented Attestazione alarm with a read-only API pipeline', () => {
    const entry = RUNBOOK_CATALOG.resolveByAlarmName(ALARM_NAME);
    assert.ok(entry);
    assert.equal(entry.product, 'INTEROP');
    assert.equal(entry.descriptor.kind, 'APIGW');
    assert.deepEqual(entry.descriptor.alarmNames, [ALARM_NAME]);
    const runbook = entry.build();
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.equal(runbook.steps.length, 2);
    assert.ok(runbook.analysisDefaults?.links?.[0]?.url.includes('/2843770902/'));
    assert.equal(RUNBOOK_CATALOG.resolveByAlarmName('interop-prod-eservices-prod-apigw-4xx'), undefined);
  });

  it('uses the source five-before/one-after diagnostic window', () => {
    assert.deepEqual(computeRunbookTimeRange(buildRunbook(), { kind: 'single', at: '2026-10-29T04:41:26.000Z' }), {
      startTime: '2026-10-29T04:36:26.000Z',
      endTime: '2026-10-29T04:42:26.000Z',
    });
  });

  it('recognizes the observed 403 requests with the exact documented conditional resolution', async () => {
    const { result, draft, queries } = await execute([row(), row({ requestPath: '/favicon.ico' })]);
    assert.equal(result.status, 'completed');
    assert.deepEqual(
      result.matchedCases.map(({ id }) => id),
      ['att-eservices-documented-probe-paths-403'],
    );
    assert.equal(draft?.kind, 'KNOWN_CASE');
    assert.equal(draft.proposedStatus, 'IN_PROGRESS');
    assert.equal(
      draft.conclusionNotes,
      "In caso di chiamate effettuate a path sospetti, non c'è alcuna azione da intraprendere.",
    );
    assert.deepEqual(draft.finalActions, []);
    assert.ok(draft.links.some(({ url }) => url.endsWith('p1791202742527259')));
    assert.equal(queries.length, 1);
    assert.ok(queries[0]?.includes('apigwId = "6iyn5o8ge4"'));
    assert.ok(queries[0]?.includes('status >= 400 and status < 500'));
    assert.ok(!queries[0]?.includes('sourceIp'));
  });

  it('does not classify empty, mixed, application or undocumented 403 contexts', async () => {
    for (const rows of [
      [],
      [row({ requestPath: '/residence-verification/status' })],
      [row({ integrationStatus: '403' })],
      [row(), row({ status: '401', requestPath: '/residence-verification/check' })],
      [row({ requestPath: '/unknown-probe' })],
    ]) {
      const { result, draft } = await execute(rows);
      assert.deepEqual(result.matchedCases, []);
      assert.equal(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    }
  });

  it('does not turn query failure into empty evidence or a completed analysis', async () => {
    const { result, queries } = await execute([], true);
    assert.equal(result.status, 'failed');
    assert.deepEqual(result.matchedCases, []);
    assert.equal(queries.length, 1);
  });

  it('does not interpret 504 context as the cause of a 4xx alarm', async () => {
    const { result } = await execute([
      row({ status: '504', integrationStatus: '504', integrationError: 'Execution failed due to a timeout error' }),
    ]);
    assert.deepEqual(result.matchedCases, []);
  });

  it('keeps the single supported case open without an inferred downstream or final action', () => {
    assert.equal(KNOWN_CASES.length, 1);
    assert.equal(KNOWN_CASES[0]?.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.equal(KNOWN_CASES[0]?.analysis?.downstreams, undefined);
    assert.deepEqual(KNOWN_CASES[0]?.analysis?.finalActions, []);
  });
});
