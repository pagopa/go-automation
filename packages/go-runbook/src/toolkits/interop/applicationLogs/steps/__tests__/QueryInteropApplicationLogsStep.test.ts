import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWSCloudWatchLogsQueryOptions, AWSCloudWatchLogsTimeRange } from '@pagopa/go-aws/cloudwatch-logs';
import { QueryInteropApplicationLogsStep } from '../QueryInteropApplicationLogsStep.js';
import { INTEROP_K8S_QUERY_PROFILE } from '../../../families/k8s/profiles/INTEROP_K8S_QUERY_PROFILE.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';
import { TEST_TIME_RANGE_PARAMS } from '../../../../../__tests__/helpers/TEST_TIME_RANGE_PARAMS.js';

describe('QueryInteropApplicationLogsStep', () => {
  it('queries the runtime-resolved log group of the pod with search-configured-profiles', async () => {
    const seen: string[] = [];
    const rows = [logRow({ '@message': 'ERROR' })];
    const query = async (
      logGroups: ReadonlyArray<string>,
      text: string,
      timeRange: AWSCloudWatchLogsTimeRange,
      options: AWSCloudWatchLogsQueryOptions,
    ): Promise<typeof rows> => {
      await Promise.resolve();
      seen.push(logGroups.join(','), text, timeRange.start.toISOString(), String(options.logGroupResolutionMode));
      return rows;
    };
    const step = new QueryInteropApplicationLogsStep({
      id: 'query',
      label: 'Query',
      queryProfileId: INTEROP_K8S_QUERY_PROFILE.applicationLogsQueryProfileId,
      buildQuery: INTEROP_K8S_QUERY_PROFILE.buildApplicationLogsQuery,
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });

    const result = await step.execute(
      createTestContext({
        vars: {
          interopLogGroup: '/aws/eks/att/application',
          interopPodApp: 'interop-be-bff',
          interopEnvironment: 'att',
        },
        params: TEST_TIME_RANGE_PARAMS,
        services: { cloudWatchLogs: { query } },
      }),
    );

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, rows);
    const [logGroups, text, start, mode] = seen;
    assert.strictEqual(logGroups, '/aws/eks/att/application');
    assert.match(text ?? '', /pod_app like \/interop\\-be\\-bff\//);
    assert.strictEqual(start, TEST_TIME_RANGE_PARAMS['startTime']);
    assert.strictEqual(mode, 'search-configured-profiles');
  });
});
