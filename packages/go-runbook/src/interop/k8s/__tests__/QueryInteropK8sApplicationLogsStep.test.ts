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
import { QueryInteropK8sApplicationLogsStep } from '../steps/QueryInteropK8sApplicationLogsStep.js';

interface SeenQuery {
  readonly logGroups: ReadonlyArray<string>;
  readonly query: string;
  readonly timeRange: AWSCloudWatchLogsTimeRange;
  readonly options: AWSCloudWatchLogsQueryOptions;
}

function context(cloudWatchLogs: unknown): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-07-09T10:00:00.000Z'),
    stepResults: new Map(),
    vars: new Map([
      ['interopLogGroup', '/aws/eks/interop-eks-cluster-att/application'],
      ['interopPodApp', 'interop-be-backend-for-frontend'],
      ['interopEnvironment', 'att'],
    ]),
    params: new Map([
      ['startTime', '2026-07-09T09:55:00.000Z'],
      ['endTime', '2026-07-09T10:05:00.000Z'],
    ]),
    logs: [],
    services: { cloudWatchLogs } as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

describe('QueryInteropK8sApplicationLogsStep', () => {
  it('queries the runtime-resolved log group with search-configured-profiles', async () => {
    let seen: SeenQuery | undefined;
    const rows: ReadonlyArray<ReadonlyArray<ResultField>> = [[{ field: '@message', value: 'ERROR' }]];
    const service = {
      async queryWithStatistics(
        logGroups: ReadonlyArray<string>,
        query: string,
        timeRange: AWSCloudWatchLogsTimeRange,
        options: AWSCloudWatchLogsQueryOptions,
      ): Promise<AWSCloudWatchLogsQueryResult> {
        seen = { logGroups, query, timeRange, options };
        await Promise.resolve();
        return {
          rows,
          statistics: { bytesScanned: 1, recordsScanned: 1, recordsMatched: 1 },
          queryExecutions: [],
        };
      },
    };

    const step = new QueryInteropK8sApplicationLogsStep({
      id: 'query',
      label: 'Query',
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });
    const result = await step.execute(context(service));

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, rows);
    assert.deepStrictEqual(seen?.logGroups, ['/aws/eks/interop-eks-cluster-att/application']);
    assert.match(seen?.query ?? '', /pod_app like \/interop\\-be\\-backend\\-for\\-frontend\//);
    assert.strictEqual(seen?.options.logGroupResolutionMode, 'search-configured-profiles');
    assert.strictEqual(seen?.timeRange.start.toISOString(), '2026-07-09T09:55:00.000Z');
  });
});
