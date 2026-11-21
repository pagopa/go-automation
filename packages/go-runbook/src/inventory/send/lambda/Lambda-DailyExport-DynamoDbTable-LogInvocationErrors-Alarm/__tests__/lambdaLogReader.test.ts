import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { createTestServiceRegistry, lambda } from '../../../../../toolkits/send/index.js';
import { LAMBDA_LOG_READER } from '../lambdaLogReader.js';
import type { OperationalContext } from '../../../../../toolkits/common/services/OperationalContext.js';
import { EMPTY_RUNBOOK_READS } from '../../../../../engine/reads/EMPTY_RUNBOOK_READS.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;
interface Call {
  key: string;
  query: string;
}
type RowsForQueryFn = (key: string, query: string) => Rows;
const SOURCES = ['configured-reader-a', 'configured-reader-b'];

function row(requestId: string, key?: string): ReadonlyArray<GOLogsInsightsResultField> {
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
): OperationalContext {
  return {
    executionId: 'test',
    startedAt: new Date(),
    logs: [],
    recoveredErrors: [],
    reads: EMPTY_RUNBOOK_READS,
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
    const step = new lambda.QueryLambdaAcrossAccountsStep({ ...LAMBDA_LOG_READER, queryKind: 'errors' });
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
  it('fails if no log source is configured', async () => {
    for (const kind of ['errors', 'invocation'] as const) {
      const calls: Call[] = [];
      const result = await new lambda.QueryLambdaAcrossAccountsStep({ ...LAMBDA_LOG_READER, queryKind: kind }).execute(
        context(calls, []),
      );
      assert.strictEqual(result.success, false);
      assert.deepStrictEqual(calls, []);
    }
  });
  it('returns empty evidence for a single source with no errors and skips invocation queries', async () => {
    const calls: Call[] = [];
    const key = '123456789012';
    const input = context(calls, [key], () => []);
    const errors = await new lambda.QueryLambdaAcrossAccountsStep({
      ...LAMBDA_LOG_READER,
      queryKind: 'errors',
    }).execute(input);
    assert.strictEqual(errors.success, true);
    assert.deepStrictEqual(errors.output, []);
    assert.strictEqual(errors.vars?.['dailyExportSourcesChecked'], key);
    assert.strictEqual(errors.vars?.['dailyExportErrorLogCount'], '0');
    (input.stepResults as Map<string, unknown>).set('query-lambda-errors', errors.output);
    const invocation = await new lambda.QueryLambdaAcrossAccountsStep({
      ...LAMBDA_LOG_READER,
      queryKind: 'invocation',
    }).execute(input);
    assert.strictEqual(invocation.success, true);
    assert.deepStrictEqual(invocation.output, []);
    assert.strictEqual(calls.length, 1);
  });
  it('declares a source it cannot read unavailable and keeps the rows of the others', async () => {
    const calls: Call[] = [];
    const input = context(calls, SOURCES, (key) => {
      if (key === SOURCES[1]) throw Error('AccessDenied');
      return [row('request-1')];
    });
    const result = await new lambda.QueryLambdaAcrossAccountsStep({
      ...LAMBDA_LOG_READER,
      queryKind: 'errors',
    }).execute(input);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.length, 1);
    assert.deepStrictEqual(
      result.coverage?.map(({ source, reason }) => ({ source, reason })),
      [{ source: SOURCES[1], reason: 'unavailable' }],
    );
  });
  it('keeps a saturated error scan of any configured source, declaring the source saturated', async () => {
    for (const saturated of SOURCES) {
      const calls: Call[] = [];
      const result = await new lambda.QueryLambdaAcrossAccountsStep({
        ...LAMBDA_LOG_READER,
        queryKind: 'errors',
      }).execute(
        context(calls, SOURCES, (key) =>
          key === saturated ? Array.from({ length: 1000 }, () => row('request-1')) : [],
        ),
      );
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output?.length, 1000);
      assert.deepStrictEqual(
        result.coverage?.map(({ source, reason }) => ({ source, reason })),
        [{ source: saturated, reason: 'saturated' }],
      );
      assert.match(result.coverage?.[0]?.detail ?? '', /1000-row limit/);
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
    const result = await new lambda.QueryLambdaAcrossAccountsStep({
      ...LAMBDA_LOG_READER,
      queryKind: 'invocation',
    }).execute(input);
    assert.strictEqual(result.success, true);
    assert.strictEqual(calls.length, 2);
    assert.ok(calls[0]?.query.includes('request-a'));
    assert.ok(!calls[0]?.query.includes('request-b'));
    assert.ok(calls[1]?.query.includes('request-b'));
    assert.ok(!calls[1]?.query.includes('request-a'));
  });
});
