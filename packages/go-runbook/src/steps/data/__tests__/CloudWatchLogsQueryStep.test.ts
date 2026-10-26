import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type {
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryResult,
  AWSCloudWatchLogsTimeRange,
  ResultField,
} from '@go-automation/go-common/aws';
import type { GOLogger } from '@go-automation/go-common/core';
import { CloudWatchLogsQueryStep } from '../CloudWatchLogsQueryStep.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../registry/createTestServiceRegistry.js';
import { ConsoleRunbookReporter } from '../../../registry/reporters/ConsoleRunbookReporter.js';

function makeContext(params: ReadonlyArray<readonly [string, string]> = []): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map(),
    vars: new Map(),
    params: new Map(params),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

describe('CloudWatchLogsQueryStep.getTraceInfo', () => {
  it('returns query, logGroups, and timeRange', () => {
    const step = new CloudWatchLogsQueryStep({
      id: 's',
      label: 'l',
      logGroups: ['lg-1'],
      query: 'q',
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });
    const info = step.getTraceInfo(
      makeContext([
        ['startTime', '2026-01-01T00:00:00.000Z'],
        ['endTime', '2026-01-01T00:10:00.000Z'],
      ]),
    );
    assert.strictEqual(info['query'], 'q');
    assert.deepStrictEqual(info['logGroups'], ['lg-1']);
    assert.deepStrictEqual(info['timeRange'], {
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-01-01T00:10:00.000Z',
    });
  });

  it('propagates traceMetadata into the trace info output', () => {
    const step = new CloudWatchLogsQueryStep({
      id: 's',
      label: 'l',
      logGroups: ['lg'],
      query: 'q',
      timeRangeFromParams: { start: 'a', end: 'b' },
      traceMetadata: { queryProfileId: 'send', queryKind: 'access-log' },
    });
    const info = step.getTraceInfo(makeContext());
    assert.strictEqual(info['queryProfileId'], 'send');
    assert.strictEqual(info['queryKind'], 'access-log');
  });

  it('does NOT allow traceMetadata to override reserved keys (query, logGroups, timeRange)', () => {
    const step = new CloudWatchLogsQueryStep({
      id: 's',
      label: 'l',
      logGroups: ['real-lg'],
      query: 'real-query',
      timeRangeFromParams: { start: 'a', end: 'b' },
      traceMetadata: {
        query: 'hijacked-query',
        logGroups: ['hijacked-lg'],
        timeRange: { hijacked: true },
        queryProfileId: 'send',
      },
    });
    const info = step.getTraceInfo(makeContext());
    assert.strictEqual(info['query'], 'real-query');
    assert.deepStrictEqual(info['logGroups'], ['real-lg']);
    assert.notDeepStrictEqual(info['timeRange'], { hijacked: true });
    // Non-reserved metadata is still propagated.
    assert.strictEqual(info['queryProfileId'], 'send');
  });

  it('produces a trace info without metadata keys when traceMetadata is undefined', () => {
    const step = new CloudWatchLogsQueryStep({
      id: 's',
      label: 'l',
      logGroups: ['lg'],
      query: 'q',
      timeRangeFromParams: { start: 'a', end: 'b' },
    });
    const info = step.getTraceInfo(makeContext());
    assert.deepStrictEqual(Object.keys(info).sort(), ['logGroups', 'query', 'timeRange']);
  });
});

describe('CloudWatchLogsQueryStep.execute', () => {
  it('falls back only after an empty successful query and preserves both query statistics', async () => {
    const queries: string[] = [];
    const step = new CloudWatchLogsQueryStep({
      id: 'fallback',
      label: 'fallback',
      logGroups: ['lg'],
      query: 'initial',
      emptyResultFallbackQuery: 'fallback {{params.code}}',
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
      paginateResults: true,
    });
    const ctx: RunbookContext = {
      ...makeContext([
        ['startTime', '2026-01-01T00:00:00Z'],
        ['endTime', '2026-01-01T00:10:00Z'],
        ['code', '400'],
      ]),
      services: createTestServiceRegistry({
        cloudWatchLogs: {
          queryWithStatistics: async (
            _groups: unknown,
            query: string,
            _range: unknown,
            options: AWSCloudWatchLogsQueryOptions,
          ) => {
            await Promise.resolve();
            queries.push(query);
            assert.equal(options.paginateResults, true);
            const rows = query === 'initial' ? [] : [[{ field: 'status', value: '403' }]];
            return {
              rows,
              statistics: { bytesScanned: 100, recordsScanned: 10, recordsMatched: rows.length },
              queryExecutions: [
                {
                  queryId: query,
                  profile: 'configured',
                  logGroups: ['lg'],
                  statistics: { bytesScanned: 100, recordsScanned: 10, recordsMatched: rows.length },
                },
              ],
            };
          },
        },
      }),
    };
    const result = await step.execute(ctx);
    assert.equal(result.success, true);
    assert.deepEqual(queries, ['initial', 'fallback 400']);
    assert.equal(result.output?.length, 1);
    assert.equal(result.diagnostics?.cloudWatchLogs?.statistics.bytesScanned, 200);
    assert.equal(result.diagnostics?.cloudWatchLogs?.queryExecutions.length, 2);
    assert.equal(step.getTraceInfo(ctx)['emptyResultFallbackQuery'], 'fallback 400');
  });
  it('does not fall back after a nonempty result or a failed query', async () => {
    const step = new CloudWatchLogsQueryStep({
      id: 'fallback',
      label: 'fallback',
      logGroups: ['lg'],
      query: 'initial',
      emptyResultFallbackQuery: 'fallback',
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });
    for (const fail of [false, true]) {
      let calls = 0;
      const ctx: RunbookContext = {
        ...makeContext([
          ['startTime', '2026-01-01T00:00:00Z'],
          ['endTime', '2026-01-01T00:10:00Z'],
        ]),
        services: createTestServiceRegistry({
          cloudWatchLogs: {
            query: async () => {
              await Promise.resolve();
              calls++;
              if (fail) throw new Error('AccessDenied');
              return [[{ field: 'status', value: '500' }]];
            },
          },
        }),
      };
      const result = await step.execute(ctx);
      assert.equal(result.success, !fail);
      assert.equal(calls, 1);
    }
  });
  it('keeps a failed fallback query as a failure rather than reporting empty evidence', async () => {
    const step = new CloudWatchLogsQueryStep({
      id: 'fallback',
      label: 'fallback',
      logGroups: ['lg'],
      query: 'initial',
      emptyResultFallbackQuery: 'fallback',
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });
    const ctx: RunbookContext = {
      ...makeContext([
        ['startTime', '2026-01-01T00:00:00Z'],
        ['endTime', '2026-01-01T00:10:00Z'],
      ]),
      services: createTestServiceRegistry({
        cloudWatchLogs: {
          query: async (_groups: unknown, query: string) => {
            await Promise.resolve();
            if (query === 'fallback') throw new Error('AccessDenied');
            return [];
          },
        },
      }),
    };
    assert.equal((await step.execute(ctx)).success, false);
  });
  it('returns rows and stores CloudWatch Logs statistics as diagnostics', async () => {
    const rows: ReadonlyArray<ReadonlyArray<ResultField>> = [
      [{ field: '@timestamp', value: '2026-01-01T00:00:01.000Z' }],
    ];
    const logLines: string[] = [];
    const step = new CloudWatchLogsQueryStep({
      id: 's',
      label: 'l',
      logGroups: ['lg-1'],
      query: 'q',
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });
    const context: RunbookContext = {
      ...makeContext([
        ['startTime', '2026-01-01T00:00:00.000Z'],
        ['endTime', '2026-01-01T00:10:00.000Z'],
      ]),
      services: createTestServiceRegistry({
        reporter: new ConsoleRunbookReporter({
          text: (message: string) => logLines.push(message),
          newline: () => logLines.push(''),
        } as unknown as GOLogger),
        cloudWatchLogs: {
          async queryWithStatistics(): Promise<AWSCloudWatchLogsQueryResult> {
            await Promise.resolve();
            return {
              rows,
              statistics: { bytesScanned: 1024, recordsScanned: 50, recordsMatched: 3 },
              queryExecutions: [
                {
                  queryId: 'qid-1',
                  profile: 'profile-1',
                  logGroups: ['lg-1'],
                  statistics: { bytesScanned: 1024, recordsScanned: 50, recordsMatched: 3 },
                },
              ],
            };
          },
          async query(): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> {
            await Promise.resolve();
            throw new Error('query() should not be used when queryWithStatistics is available');
          },
        },
      }),
    };

    const result = await step.execute(context);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, rows);
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.statistics.bytesScanned, 1024);
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.queryExecutions[0]?.queryId, 'qid-1');
    context.services.reporter.flush();
    assert.ok(logLines.some((line) => line.includes('bytesScanned=1024')));
  });

  it('propagates paginateResults only when configured', async () => {
    const seenOptions: unknown[] = [];
    const step = new CloudWatchLogsQueryStep({
      id: 's',
      label: 'l',
      logGroups: ['lg-1'],
      query: 'q',
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
      paginateResults: true,
    });
    const context: RunbookContext = {
      ...makeContext([
        ['startTime', '2026-01-01T00:00:00.000Z'],
        ['endTime', '2026-01-01T00:10:00.000Z'],
      ]),
      services: createTestServiceRegistry({
        cloudWatchLogs: {
          async queryWithStatistics(
            _logGroups: ReadonlyArray<string>,
            _query: string,
            _timeRange: AWSCloudWatchLogsTimeRange,
            options?: AWSCloudWatchLogsQueryOptions,
          ): Promise<AWSCloudWatchLogsQueryResult> {
            seenOptions.push(options);
            await Promise.resolve();
            return {
              rows: [],
              statistics: { bytesScanned: 0, recordsScanned: 0, recordsMatched: 0 },
              queryExecutions: [],
            };
          },
          async query(): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> {
            await Promise.resolve();
            throw new Error('query() should not be used when queryWithStatistics is available');
          },
        },
      }),
    };

    const result = await step.execute(context);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(seenOptions, [{ paginateResults: true }]);
  });
});
