import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWSCloudWatchLogsQueryOptions } from '@pagopa/go-aws/cloudwatch-logs';
import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { InteropK8sApplicationLogAnalysis } from '../AnalyzeInteropApplicationLogsStep.js';
import { QueryInteropCidTrackerStep } from '../QueryInteropCidTrackerStep.js';
import { INTEROP_K8S_QUERY_PROFILE } from '../../../families/k8s/profiles/INTEROP_K8S_QUERY_PROFILE.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';
import { TEST_TIME_RANGE_PARAMS } from '../../../../../__tests__/helpers/TEST_TIME_RANGE_PARAMS.js';
import type { OperationalContext } from '../../../../common/services/OperationalContext.js';

const LOG_GROUP = '/aws/eks/interop-eks-cluster-prod/application';

function analysisWithCids(count: number): InteropK8sApplicationLogAnalysis {
  const cids = Array.from({ length: count }, (_, index) => `cid-${String(index)}`);
  return { logCount: count, cidCount: count, cids, logsWithoutCidCount: 0, representativeMessages: [] };
}

function step(maxCids?: number): QueryInteropCidTrackerStep {
  return new QueryInteropCidTrackerStep({
    id: 'query-cid',
    label: 'Query CID',
    fromStep: 'analyze',
    queryProfileId: INTEROP_K8S_QUERY_PROFILE.cidTrackerQueryProfileId,
    buildQuery: INTEROP_K8S_QUERY_PROFILE.buildCidTrackerQuery,
    timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    ...(maxCids === undefined ? {} : { maxCids }),
  });
}

/** A context over `cidCount` CIDs whose logs service records every query and returns one row. */
function recording(cidCount: number): { readonly context: OperationalContext; readonly queries: string[] } {
  const queries: string[] = [];
  const query = async (
    logGroups: ReadonlyArray<string>,
    text: string,
    _timeRange: unknown,
    options: AWSCloudWatchLogsQueryOptions,
  ): Promise<ReadonlyArray<GOLogsInsightsResultField[]>> => {
    await Promise.resolve();
    assert.deepStrictEqual(logGroups, [LOG_GROUP]);
    assert.strictEqual(options.logGroupResolutionMode, 'search-configured-profiles');
    queries.push(text);
    return [logRow({ '@message': 'ok' })];
  };
  const context = createTestContext({
    stepResults: { analyze: analysisWithCids(cidCount) },
    vars: { interopLogGroup: LOG_GROUP },
    params: TEST_TIME_RANGE_PARAMS,
    services: { cloudWatchLogs: { query } },
  });
  return { context, queries };
}

describe('QueryInteropCidTrackerStep', () => {
  it('skips CloudWatch when no CID is available', async () => {
    const { context, queries } = recording(0);

    const result = await step().execute(context);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, []);
    assert.strictEqual(result.vars?.['interopCidTrackerExecuted'], 'false');
    assert.deepStrictEqual(queries, []);
  });

  it('queries the resolved log group once per CID', async () => {
    const { context, queries } = recording(2);

    const result = await step().execute(context);

    assert.strictEqual(result.output?.length, 2);
    assert.deepStrictEqual(
      ['Executed', 'CidCount', 'LogCount'].map((k) => result.vars?.[`interopCidTracker${k}`]),
      ['true', '2', '2'],
    );
    assert.match(queries[0] ?? '', /filter cid = "cid-0"/);
    assert.match(queries[1] ?? '', /filter cid = "cid-1"/);
  });

  it('caps the CID fan-out, so one alarm cannot issue thousands of sequential queries', async () => {
    // The upstream scan returns one row per log line, and each CID costs one sequential query.
    const cases: ReadonlyArray<readonly [number, number | undefined, number]> = [
      [7, undefined, 7],
      [150, undefined, 100],
      [50, 3, 3],
    ];
    for (const [cids, maxCids, queried] of cases) {
      const { context, queries } = recording(cids);
      const result = await step(maxCids).execute(context);
      assert.strictEqual(queries.length, queried);
      assert.strictEqual(result.vars?.['interopCidTrackerCidCount'], String(queried));
      assert.strictEqual(result.vars?.['interopCidTrackerSkippedCidCount'], String(cids - queried));
    }
  });

  it('traces only the queries it will actually run', () => {
    const traced = step().getTraceInfo(recording(500).context) as {
      readonly queries: ReadonlyArray<unknown>;
      readonly identifiers: { readonly cids: ReadonlyArray<string> };
    };

    assert.strictEqual(traced.queries.length, 100);
    assert.strictEqual(traced.identifiers.cids.length, 100);
  });
});
