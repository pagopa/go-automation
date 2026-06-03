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
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';

function makeContext(params: ReadonlyArray<readonly [string, string]> = []): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map(),
    vars: new Map(),
    params: new Map(params),
    logs: [],
    services: {} as unknown as ServiceRegistry,
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
      logger: { text: (message: string) => logLines.push(message) } as unknown as GOLogger,
      services: {
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
      } as unknown as ServiceRegistry,
    };

    const result = await step.execute(context);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, rows);
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.statistics.bytesScanned, 1024);
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.queryExecutions[0]?.queryId, 'qid-1');
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
      services: {
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
      } as unknown as ServiceRegistry,
    };

    const result = await step.execute(context);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(seenOptions, [{ paginateResults: true }]);
  });
});
