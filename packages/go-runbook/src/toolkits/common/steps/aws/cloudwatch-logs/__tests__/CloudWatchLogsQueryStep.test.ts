import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AWSCloudWatchLogsQueryOptions, AWSCloudWatchLogsQueryResult } from '@pagopa/go-aws/cloudwatch-logs';
import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { CloudWatchLogsQueryStep } from '../CloudWatchLogsQueryStep.js';
import type { CloudWatchLogsQueryConfig } from '../CloudWatchLogsQueryStep.js';
import type { OperationalContext } from '../../../../services/OperationalContext.js';
import type { TestServiceOverrides } from '../../../../testing/TestServiceOverrides.js';
import { captureNarrative } from '../../../../../../__tests__/helpers/captureNarrative.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

const TIME_PARAMS = { startTime: '2026-01-01T00:00:00.000Z', endTime: '2026-01-01T00:10:00.000Z' };

/** A query step on `lg-1` reading its time range from {@link TIME_PARAMS}. */
function createStep(overrides: Partial<CloudWatchLogsQueryConfig> = {}): CloudWatchLogsQueryStep {
  return new CloudWatchLogsQueryStep({
    id: 's',
    label: 'l',
    logGroups: ['lg-1'],
    query: 'q',
    timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    ...overrides,
  });
}

/** Context with the time params and the given services. */
function context(
  services: TestServiceOverrides = {},
  params: Readonly<Record<string, string>> = {},
): OperationalContext {
  return createTestContext({ params: { ...TIME_PARAMS, ...params }, services });
}

describe('CloudWatchLogsQueryStep.getTraceInfo', () => {
  it('returns only query, logGroups and the resolved timeRange without traceMetadata', () => {
    const info = createStep().getTraceInfo(context());

    assert.deepStrictEqual(info, {
      query: 'q',
      logGroups: ['lg-1'],
      timeRange: { start: TIME_PARAMS.startTime, end: TIME_PARAMS.endTime },
    });
  });

  it('propagates traceMetadata without letting it override the reserved keys, with null time bounds when the params are missing', () => {
    const step = createStep({
      traceMetadata: {
        query: 'hijacked-query',
        logGroups: ['hijacked-lg'],
        timeRange: { hijacked: true },
        queryProfileId: 'send',
        queryKind: 'access-log',
      },
    });
    const info = step.getTraceInfo(createTestContext());

    assert.strictEqual(info['query'], 'q');
    assert.deepStrictEqual(info['logGroups'], ['lg-1']);
    assert.deepStrictEqual(info['timeRange'], { start: null, end: null });
    assert.strictEqual(info['queryProfileId'], 'send');
    assert.strictEqual(info['queryKind'], 'access-log');
  });
});

describe('CloudWatchLogsQueryStep.execute', () => {
  it('falls back only after an empty successful query and preserves both query statistics', async () => {
    const queries: string[] = [];
    const step = createStep({
      query: 'initial',
      emptyResultFallbackQuery: 'fallback {{params.code}}',
      paginateResults: true,
    });
    const ctx = context(
      {
        cloudWatchLogs: {
          queryWithStatistics: async (
            _groups: unknown,
            query: string,
            _range: unknown,
            options: AWSCloudWatchLogsQueryOptions,
          ) => {
            await Promise.resolve();
            queries.push(query);
            assert.deepStrictEqual(options, { paginateResults: true });
            const rows = query === 'initial' ? [] : [[{ field: 'status', value: '403' }]];
            const statistics = { bytesScanned: 100, recordsScanned: 10, recordsMatched: rows.length };
            return {
              rows,
              statistics,
              queryExecutions: [{ queryId: query, profile: 'configured', logGroups: ['lg-1'], statistics }],
            };
          },
        },
      },
      { code: '400' },
    );
    const result = await step.execute(ctx);
    assert.equal(result.success, true);
    assert.deepEqual(queries, ['initial', 'fallback 400']);
    assert.equal(result.output?.length, 1);
    assert.equal(result.diagnostics?.cloudWatchLogs?.statistics.bytesScanned, 200);
    assert.equal(result.diagnostics?.cloudWatchLogs?.queryExecutions.length, 2);
    assert.equal(step.getTraceInfo(ctx)['emptyResultFallbackQuery'], 'fallback 400');
  });

  it('does not fall back after a nonempty result or a failed query', async () => {
    const step = createStep({ query: 'initial', emptyResultFallbackQuery: 'fallback' });
    for (const fail of [false, true]) {
      let calls = 0;
      const query = async (): Promise<ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>> => {
        await Promise.resolve();
        calls++;
        if (fail) throw new Error('AccessDenied');
        return [[{ field: 'status', value: '500' }]];
      };
      const result = await step.execute(context({ cloudWatchLogs: { query } }));
      assert.equal(result.success, !fail);
      assert.equal(calls, 1);
    }
  });

  it('keeps a failed fallback query as a failure rather than reporting empty evidence', async () => {
    const step = createStep({ query: 'initial', emptyResultFallbackQuery: 'fallback' });
    const query = async (_groups: unknown, sql: string): Promise<ReadonlyArray<never>> => {
      await Promise.resolve();
      if (sql === 'fallback') throw new Error('AccessDenied');
      return [];
    };
    assert.equal((await step.execute(context({ cloudWatchLogs: { query } }))).success, false);
  });

  it('returns rows and stores CloudWatch Logs statistics as diagnostics, without pagination unless configured', async () => {
    const rows: ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>> = [
      [{ field: '@timestamp', value: '2026-01-01T00:00:01.000Z' }],
    ];
    const seenOptions: unknown[] = [];
    const { reporter, lines } = captureNarrative();
    const statistics = { bytesScanned: 1024, recordsScanned: 50, recordsMatched: 3 };
    const ctx = context({
      reporter,
      cloudWatchLogs: {
        async queryWithStatistics(
          _logGroups: unknown,
          _query: unknown,
          _timeRange: unknown,
          options?: AWSCloudWatchLogsQueryOptions,
        ): Promise<AWSCloudWatchLogsQueryResult> {
          seenOptions.push(options);
          await Promise.resolve();
          return {
            rows,
            statistics,
            queryExecutions: [{ queryId: 'qid-1', profile: 'profile-1', logGroups: ['lg-1'], statistics }],
          };
        },
      },
    });

    const result = await createStep().execute(ctx);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, rows);
    assert.deepStrictEqual(seenOptions, [{}]);
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.statistics.bytesScanned, 1024);
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.queryExecutions[0]?.queryId, 'qid-1');
    reporter.flush();
    assert.ok(lines.some((line) => line.includes('bytesScanned=1024')));
  });
});
