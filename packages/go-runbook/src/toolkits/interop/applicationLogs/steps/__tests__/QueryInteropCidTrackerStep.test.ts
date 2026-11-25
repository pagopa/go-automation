import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWSCloudWatchLogsQueryOptions } from '@pagopa/go-aws/cloudwatch-logs';
import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { InteropK8sApplicationLogAnalysis } from '../InteropK8sApplicationLogAnalysis.js';
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

function step(): QueryInteropCidTrackerStep {
  return new QueryInteropCidTrackerStep({
    id: 'query-cid',
    label: 'Query CID',
    fromStep: 'analyze',
    queryProfileId: INTEROP_K8S_QUERY_PROFILE.cidTrackerQueryProfileId,
    buildQuery: INTEROP_K8S_QUERY_PROFILE.buildCidTrackerQuery,
    timeRangeFromParams: { start: 'startTime', end: 'endTime' },
  });
}

/** The CIDs a tracker query filters on. */
function queriedCids(query: string): ReadonlyArray<string> {
  return [...(/filter cid in \[([^\]]*)\]/u.exec(query)?.[1] ?? '').matchAll(/"([^"]+)"/gu)].map(
    (match) => match[1] ?? '',
  );
}

/**
 * A context over `cidCount` CIDs whose logs service records every query and returns one row per CID it filters on;
 * the queries listed in `failing` (by position) fail.
 */
function recording(
  cidCount: number,
  failing: ReadonlySet<number> = new Set(),
): { readonly context: OperationalContext; readonly queries: string[] } {
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
    if (failing.has(queries.length - 1)) throw new Error('ThrottlingException');
    return queriedCids(text).map((cid) => logRow({ cid, '@message': `[CID=${cid}] ok` }));
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

  it('reads the CIDs of the resolved log group with one query and gives each row to its CID', async () => {
    const { context, queries } = recording(2);

    const result = await step().execute(context);

    assert.deepStrictEqual(queries.length, 1);
    assert.match(queries[0] ?? '', /filter cid in \["cid-0", "cid-1"\]/u);
    assert.deepStrictEqual(
      result.output?.map(({ cid, rows }) => [cid, rows.length]),
      [
        ['cid-0', 1],
        ['cid-1', 1],
      ],
    );
    assert.deepStrictEqual(
      ['Executed', 'CidCount', 'LogCount'].map((k) => result.vars?.[`interopCidTracker${k}`]),
      ['true', '2', '2'],
    );
  });

  it('reads every CID, a query per batch, without a cap on the CIDs', async () => {
    const { context, queries } = recording(150);

    const result = await step().execute(context);

    assert.strictEqual(queries.length, 3);
    assert.strictEqual(result.output?.length, 150);
    assert.strictEqual(result.vars?.['interopCidTrackerCidCount'], '150');
    assert.strictEqual(result.coverage, undefined);
  });

  it('keeps the CIDs of the batches that answered and leaves the others unavailable', async () => {
    const { context } = recording(60, new Set([1]));

    const result = await step().execute(context);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.length, 50);
    assert.deepStrictEqual(
      result.coverage?.map(({ reason, identifiers }) => [reason, identifiers?.length]),
      [['unavailable', 10]],
    );
  });

  it('leaves every CID unavailable when no batch answers', async () => {
    const { context } = recording(2, new Set([0]));

    const result = await step().execute(context);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, []);
    assert.deepStrictEqual(
      result.coverage?.map(({ reason, identifiers }) => [reason, identifiers?.map(({ value }) => value)]),
      [['unavailable', ['cid-0', 'cid-1']]],
    );
  });

  it('traces one query per batch of CIDs', () => {
    const traced = step().getTraceInfo(recording(120).context) as {
      readonly queries: ReadonlyArray<unknown>;
      readonly identifiers: { readonly cids: ReadonlyArray<string> };
    };

    assert.strictEqual(traced.queries.length, 3);
    assert.strictEqual(traced.identifiers.cids.length, 120);
  });
});
