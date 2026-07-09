import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryResult,
  AWSCloudWatchLogsTimeRange,
  ResultField,
} from '@go-automation/go-common/aws';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { InteropK8sApplicationLogAnalysis } from '../steps/AnalyzeInteropK8sApplicationLogsStep.js';
import { QueryInteropK8sCidTrackerStep } from '../steps/QueryInteropK8sCidTrackerStep.js';

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
    services: { cloudWatchLogs } as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
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
        { logCount: 1, cidCount: 0, cids: [], rowsWithoutCidCount: 1, representativeMessages: [] },
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
        { logCount: 2, cidCount: 2, cids: ['cid-1', 'cid-2'], rowsWithoutCidCount: 0, representativeMessages: [] },
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
});
