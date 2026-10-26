import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ResultField } from '@go-automation/go-common/aws';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import type { RunbookContext } from '../../framework.js';
import { QueryDailyExportAccountsStep } from '../QueryDailyExportAccountsStep.js';

type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;
interface Call {
  key: string;
  query: string;
}
type RowsForQueryFn = (key: string, query: string) => Rows;
const SOURCES = ['configured-reader-a', 'configured-reader-b'];

function row(requestId: string, key?: string): ReadonlyArray<ResultField> {
  return [
    { field: '@requestId', value: requestId },
    { field: '@message', value: 'ERROR' },
    ...(key === undefined ? [] : [{ field: 'sourceKey', value: key }]),
  ];
}

function context(
  calls: Call[],
  keys: ReadonlyArray<string> = SOURCES,
  rowsForQuery: RowsForQueryFn = () => [row('request-1')],
): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date(),
    logs: [],
    recoveredErrors: [],
    vars: new Map(),
    params: new Map([
      ['startTime', '2026-10-20T00:56:00Z'],
      ['endTime', '2026-10-20T01:06:00Z'],
    ]),
    stepResults: new Map([['query-lambda-errors', [row('request-a', SOURCES[0]), row('request-b', SOURCES[1])]]]),
    services: createTestServiceRegistry({
      cloudWatchLogs: {
        forTarget() {
          assert.fail('The runbook must not construct account or profile targets');
        },
        getConfiguredSources() {
          return keys.map((key) => ({
            key,
            service: {
              // eslint-disable-next-line @typescript-eslint/require-await
              async queryWithStatistics(groups: ReadonlyArray<string>, query: string) {
                assert.deepStrictEqual(groups, ['/aws/lambda/Lambda-DailyExport-DynamoDbTable']);
                calls.push({ key, query });
                const rows = rowsForQuery(key, query);
                return {
                  rows,
                  statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
                  queryExecutions: [
                    {
                      queryId: key,
                      profile: key,
                      logGroups: groups,
                      statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
                    },
                  ],
                };
              },
            },
          }));
        },
      },
    }),
  };
}

describe('DailyExport queries configured sources', () => {
  it('reads every runtime source and preserves its key without deriving identities from names', async () => {
    const calls: Call[] = [],
      keys = ['runtime-alpha', 'runtime-beta', 'runtime-gamma'];
    const input = context(calls, keys);
    const step = new QueryDailyExportAccountsStep('errors');
    assert.deepStrictEqual(step.getTraceInfo(input)['sources'], keys);
    const result = await step.execute(input);
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(
      calls.map(({ key }) => key),
      keys,
    );
    assert.deepStrictEqual(
      result.output?.map((r) => r.find((f) => f.field === 'sourceKey')?.value),
      keys,
    );
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.statistics.bytesScanned, 3);
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.queryExecutions.length, 3);
    assert.ok(calls.every(({ query }) => query.includes('Status:\\s*timeout')));
  });
  it('queries and correlates within a single occurrence-scoped source', async () => {
    const key = '170533023216';
    for (const kind of ['errors', 'invocation'] as const) {
      const calls: Call[] = [];
      const input = context(calls, [key]);
      (input.stepResults as Map<string, unknown>).set('query-lambda-errors', [row('request-1', key)]);
      const result = await new QueryDailyExportAccountsStep(kind).execute(input);
      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(
        calls.map((call) => call.key),
        [key],
      );
      assert.strictEqual(result.output?.[0]?.find(({ field }) => field === 'sourceKey')?.value, key);
      assert.strictEqual(result.diagnostics?.cloudWatchLogs?.queryExecutions.length, 1);
      if (kind === 'invocation') assert.ok(calls[0]?.query.includes('request-1'));
    }
  });
  it('fails if no log source is configured', async () => {
    for (const kind of ['errors', 'invocation'] as const) {
      const calls: Call[] = [];
      const result = await new QueryDailyExportAccountsStep(kind).execute(context(calls, []));
      assert.strictEqual(result.success, false);
      assert.deepStrictEqual(calls, []);
    }
  });
  it('returns empty evidence for a single source with no errors and skips invocation queries', async () => {
    const calls: Call[] = [];
    const key = '170533023216';
    const input = context(calls, [key], () => []);
    const errors = await new QueryDailyExportAccountsStep('errors').execute(input);
    assert.strictEqual(errors.success, true);
    assert.deepStrictEqual(errors.output, []);
    assert.strictEqual(errors.vars?.['dailyExportSourcesChecked'], key);
    assert.strictEqual(errors.vars?.['dailyExportErrorLogCount'], '0');
    (input.stepResults as Map<string, unknown>).set('query-lambda-errors', errors.output);
    const invocation = await new QueryDailyExportAccountsStep('invocation').execute(input);
    assert.strictEqual(invocation.success, true);
    assert.deepStrictEqual(invocation.output, []);
    assert.strictEqual(calls.length, 1);
  });
  it('does not convert access failures into empty source evidence', async () => {
    const calls: Call[] = [];
    const input = context(calls, SOURCES, (key) => {
      if (key === SOURCES[1]) throw Error('AccessDenied');
      return [row('request-1')];
    });
    const result = await new QueryDailyExportAccountsStep('errors').execute(input);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.output, undefined);
  });
  it('rejects a saturated error scan in any configured source', async () => {
    for (const saturated of SOURCES) {
      const calls: Call[] = [];
      const result = await new QueryDailyExportAccountsStep('errors').execute(
        context(calls, SOURCES, (key) =>
          key === saturated ? Array.from({ length: 1000 }, () => row('request-1')) : [],
        ),
      );
      assert.strictEqual(result.success, false);
      assert.match(result.error ?? '', /1000-row limit/);
    }
  });
  it('correlates request IDs only within their configured source and deduplicates them', async () => {
    const calls: Call[] = [];
    const input = context(calls);
    (input.stepResults as Map<string, unknown>).set('query-lambda-errors', [
      row('request-a', SOURCES[0]),
      row('request-a', SOURCES[0]),
      row('request-b', SOURCES[1]),
    ]);
    const result = await new QueryDailyExportAccountsStep('invocation').execute(input);
    assert.strictEqual(result.success, true);
    assert.strictEqual(calls.length, 2);
    assert.ok(calls[0]?.query.includes('request-a'));
    assert.ok(!calls[0]?.query.includes('request-b'));
    assert.ok(calls[1]?.query.includes('request-b'));
    assert.ok(!calls[1]?.query.includes('request-a'));
  });
  it('splits saturated request batches instead of dropping invocation evidence', async () => {
    const calls: Call[] = [];
    const input = context(calls, SOURCES, (_key, query) =>
      (query.match(/@requestId = '/g) ?? []).length > 1
        ? Array.from({ length: 1000 }, () => row('batch'))
        : [row('single')],
    );
    (input.stepResults as Map<string, unknown>).set('query-lambda-errors', [
      row('request-a', SOURCES[0]),
      row('request-b', SOURCES[0]),
    ]);
    const result = await new QueryDailyExportAccountsStep('invocation').execute(input);
    assert.strictEqual(result.success, true);
    assert.strictEqual(calls.length, 3);
    assert.strictEqual(result.output?.length, 2);
  });
  it('fails when a single invocation is saturated or the split budget is exhausted', async () => {
    const calls: Call[] = [];
    const input = context(calls, SOURCES, () => Array.from({ length: 1000 }, () => row('single')));
    (input.stepResults as Map<string, unknown>).set('query-lambda-errors', [row('request-a', SOURCES[0])]);
    const result = await new QueryDailyExportAccountsStep('invocation').execute(input);
    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /1000-row limit/);
    const budgetCalls: Call[] = [];
    const budget = context(budgetCalls, SOURCES, (_key, query) =>
      (query.match(/@requestId = '/g) ?? []).length > 1
        ? Array.from({ length: 1000 }, () => row('batch'))
        : [row('single')],
    );
    (budget.stepResults as Map<string, unknown>).set(
      'query-lambda-errors',
      Array.from({ length: 60 }, (_, i) => row(`request-${String(i)}`, SOURCES[0])),
    );
    const exhausted = await new QueryDailyExportAccountsStep('invocation').execute(budget);
    assert.strictEqual(exhausted.success, false);
    assert.match(exhausted.error ?? '', /query budget exceeded/);
    assert.strictEqual(budgetCalls.length, 100);
  });
  it('rejects unknown source keys and skips correlation when no request ID was extracted', async () => {
    const calls: Call[] = [];
    const input = context(calls);
    (input.stepResults as Map<string, unknown>).set('query-lambda-errors', [row('request-a', 'outside-scope')]);
    const invalid = await new QueryDailyExportAccountsStep('invocation').execute(input);
    assert.strictEqual(invalid.success, false);
    assert.deepStrictEqual(calls, []);
    (input.stepResults as Map<string, unknown>).set('query-lambda-errors', [
      [
        { field: 'sourceKey', value: SOURCES[0] },
        { field: '@message', value: 'ERROR without id' },
      ],
    ]);
    const noIds = await new QueryDailyExportAccountsStep('invocation').execute(input);
    assert.strictEqual(noIds.success, true);
    assert.deepStrictEqual(noIds.output, []);
    assert.deepStrictEqual(calls, []);
  });
});
