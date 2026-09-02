import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryResult,
  AWSCloudWatchLogsTimeRange,
  ResultField,
} from '@go-automation/go-common/aws';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { InteropK8sApplicationLogAnalysis } from '../steps/AnalyzeInteropK8sApplicationLogsStep.js';
import { QueryInteropK8sCidTrackerStep } from '../steps/QueryInteropK8sCidTrackerStep.js';
import { createTestServiceRegistry } from '../../../registry/createTestServiceRegistry.js';

interface SeenQuery {
  readonly logGroups: ReadonlyArray<string>;
  readonly query: string;
  readonly timeRange: AWSCloudWatchLogsTimeRange;
  readonly options: AWSCloudWatchLogsQueryOptions;
}

function context(analysis: InteropK8sApplicationLogAnalysis, cloudWatchLogs: unknown = {}): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-07-09T10:00:00.000Z'),
    stepResults: new Map<string, unknown>([['analyze', analysis]]),
    vars: new Map([['interopLogGroup', '/aws/eks/interop-eks-cluster-prod/application']]),
    params: new Map([
      ['startTime', '2026-07-09T09:55:00.000Z'],
      ['endTime', '2026-07-09T10:05:00.000Z'],
    ]),
    logs: [],
    services: createTestServiceRegistry({ cloudWatchLogs }),
    recoveredErrors: [],
  };
}

function analysisWithCids(count: number): InteropK8sApplicationLogAnalysis {
  const cids = Array.from({ length: count }, (_, index) => `cid-${String(index)}`);
  return { logCount: count, cidCount: count, cids, logsWithoutCidCount: 0, representativeMessages: [] };
}

function step(): QueryInteropK8sCidTrackerStep {
  return new QueryInteropK8sCidTrackerStep({
    id: 'query-cid',
    label: 'Query CID',
    fromStep: 'analyze',
    timeRangeFromParams: { start: 'startTime', end: 'endTime' },
  });
}

describe('QueryInteropK8sCidTrackerStep', () => {
  it('skips CloudWatch when no CID is available', async () => {
    let calls = 0;
    const result = await step().execute(
      context(
        { logCount: 1, cidCount: 0, cids: [], logsWithoutCidCount: 1, representativeMessages: [] },
        {
          async queryWithStatistics(): Promise<AWSCloudWatchLogsQueryResult> {
            calls += 1;
            await Promise.resolve();
            throw new Error('should not query');
          },
        },
      ),
    );

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, []);
    assert.strictEqual(result.vars?.['interopCidTrackerExecuted'], 'false');
    assert.strictEqual(calls, 0);
  });

  it('queries CloudWatch once per CID using the resolved log group', async () => {
    const seen: SeenQuery[] = [];
    const rows: ReadonlyArray<ReadonlyArray<ResultField>> = [[{ field: '@message', value: '[CID=cid-1] ok' }]];
    const result = await step().execute(
      context(
        { logCount: 2, cidCount: 2, cids: ['cid-1', 'cid-2'], logsWithoutCidCount: 0, representativeMessages: [] },
        {
          async queryWithStatistics(
            logGroups: ReadonlyArray<string>,
            query: string,
            timeRange: AWSCloudWatchLogsTimeRange,
            options: AWSCloudWatchLogsQueryOptions,
          ): Promise<AWSCloudWatchLogsQueryResult> {
            seen.push({ logGroups, query, timeRange, options });
            await Promise.resolve();
            return {
              rows,
              statistics: { bytesScanned: 1, recordsScanned: 1, recordsMatched: 1 },
              queryExecutions: [],
            };
          },
        },
      ),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.length, 2);
    assert.strictEqual(result.vars?.['interopCidTrackerExecuted'], 'true');
    assert.strictEqual(result.vars?.['interopCidTrackerCidCount'], '2');
    assert.strictEqual(result.vars?.['interopCidTrackerLogCount'], '2');
    assert.deepStrictEqual(
      seen.map((entry) => entry.logGroups),
      [['/aws/eks/interop-eks-cluster-prod/application'], ['/aws/eks/interop-eks-cluster-prod/application']],
    );
    assert.ok(seen.every((entry) => entry.options.logGroupResolutionMode === 'search-configured-profiles'));
    assert.match(seen[0]?.query ?? '', /filter cid = "cid-1"/);
  });

  it('caps the CID fan-out: one alarm cannot issue thousands of sequential queries', async () => {
    // The upstream scan returns one row per log line — up to 10.000 on the API
    // Gateway 5xx profile — and each CID costs one sequential CloudWatch query.
    let calls = 0;
    const cloudWatchLogs = {
      queryWithStatistics: async (): Promise<AWSCloudWatchLogsQueryResult> => {
        calls += 1;
        await Promise.resolve();
        return {
          rows: [],
          statistics: { recordsMatched: 0, recordsScanned: 0, bytesScanned: 0 },
          queryExecutions: [],
        };
      },
    };

    const result = await step().execute(context(analysisWithCids(10_000), cloudWatchLogs));

    assert.strictEqual(calls, 100);
    assert.strictEqual(result.vars?.['interopCidTrackerCidCount'], '100');
    assert.strictEqual(result.vars?.['interopCidTrackerSkippedCidCount'], '9900');
  });

  it('queries every CID when the set is within the cap', async () => {
    let calls = 0;
    const cloudWatchLogs = {
      queryWithStatistics: async (): Promise<AWSCloudWatchLogsQueryResult> => {
        calls += 1;
        await Promise.resolve();
        return {
          rows: [],
          statistics: { recordsMatched: 0, recordsScanned: 0, bytesScanned: 0 },
          queryExecutions: [],
        };
      },
    };

    const result = await step().execute(context(analysisWithCids(7), cloudWatchLogs));

    assert.strictEqual(calls, 7);
    assert.strictEqual(result.vars?.['interopCidTrackerSkippedCidCount'], '0');
  });

  it('honours an explicit cap', async () => {
    let calls = 0;
    const cloudWatchLogs = {
      queryWithStatistics: async (): Promise<AWSCloudWatchLogsQueryResult> => {
        calls += 1;
        await Promise.resolve();
        return {
          rows: [],
          statistics: { recordsMatched: 0, recordsScanned: 0, bytesScanned: 0 },
          queryExecutions: [],
        };
      },
    };
    const capped = new QueryInteropK8sCidTrackerStep({
      id: 'query-cid',
      label: 'Query CID',
      fromStep: 'analyze',
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
      maxCids: 3,
    });

    await capped.execute(context(analysisWithCids(50), cloudWatchLogs));

    assert.strictEqual(calls, 3);
  });

  it('traces only the queries it will actually run', () => {
    const traced = step().getTraceInfo(context(analysisWithCids(500))) as {
      readonly queries: ReadonlyArray<unknown>;
      readonly identifiers: { readonly cids: ReadonlyArray<string> };
    };

    assert.strictEqual(traced.queries.length, 100);
    assert.strictEqual(traced.identifiers.cids.length, 100);
  });
});
