import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryResult,
  AWSCloudWatchLogsTimeRange,
} from '@pagopa/go-aws/cloudwatch-logs';
import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { RunbookContext } from '../../../../../engine/types/RunbookContext.js';
import { QueryInteropApplicationLogsStep } from '../QueryInteropApplicationLogsStep.js';
import { createTestServiceRegistry } from '../../../../common/testing/createTestServiceRegistry.js';
import { INTEROP_K8S_QUERY_PROFILE } from '../../../families/k8s/profiles/INTEROP_K8S_QUERY_PROFILE.js';

const PROFILE_FIELDS = {
  queryProfileId: INTEROP_K8S_QUERY_PROFILE.applicationLogsQueryProfileId,
  buildQuery: INTEROP_K8S_QUERY_PROFILE.buildApplicationLogsQuery,
};

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
    services: createTestServiceRegistry({ cloudWatchLogs }),
    recoveredErrors: [],
  };
}

describe('QueryInteropApplicationLogsStep', () => {
  it('queries the runtime-resolved log group with search-configured-profiles', async () => {
    let seen: SeenQuery | undefined;
    const rows: ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>> = [[{ field: '@message', value: 'ERROR' }]];
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

    const step = new QueryInteropApplicationLogsStep({
      ...PROFILE_FIELDS,
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
