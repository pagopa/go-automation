import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { MetricDatapoint } from '@pagopa/go-aws/cloudwatch-metrics';
import type { StepResult } from '../../../../../../engine/types/StepResult.js';
import { CloudWatchMetricsStep } from '../CloudWatchMetricsStep.js';
import type { CloudWatchMetricsConfig } from '../CloudWatchMetricsStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

const DATAPOINTS: ReadonlyArray<MetricDatapoint> = [{ timestamp: new Date('2026-01-01T00:00:00.000Z'), value: 7 }];

const BASE = {
  id: 'get-5xx',
  label: 'Get 5XX count',
  namespace: 'AWS/ApiGateway',
  metricName: '5XXError',
  dimensions: [{ name: 'ApiName', value: '{{params.apiName}}' }],
  timeRangeFromParams: { start: 'alarmDatetime', end: 'alarmDatetimeEnd' },
} as const;

/** Runs the step against a stub metrics service and returns its result with the recorded calls. */
async function runMetrics(config: CloudWatchMetricsConfig): Promise<{
  readonly result: StepResult<ReadonlyArray<MetricDatapoint>>;
  readonly calls: unknown[][];
}> {
  const calls: unknown[][] = [];
  const getMetricData = async (...args: unknown[]): Promise<ReadonlyArray<MetricDatapoint>> => {
    // Namespace, metric, dimensions, time range, period and statistic; the abort signal follows.
    calls.push(args.slice(0, 6));
    return Promise.resolve(DATAPOINTS);
  };
  const result = await new CloudWatchMetricsStep(config).execute(
    createTestContext({
      params: { alarmDatetime: '2026-01-01T00:00:00Z', alarmDatetimeEnd: '2026-01-01T01:00:00Z', apiName: 'pn-api' },
      services: { cloudWatchMetrics: { getMetricData } },
    }),
  );
  return { result, calls };
}

describe('CloudWatchMetricsStep', () => {
  it('returns the datapoints, forwarding the metric with interpolated dimensions and the default period and statistic', async () => {
    const { result, calls } = await runMetrics(BASE);

    assert.deepStrictEqual(result, { success: true, output: DATAPOINTS });
    assert.deepStrictEqual(calls[0]?.slice(0, 3), [
      'AWS/ApiGateway',
      '5XXError',
      [{ name: 'ApiName', value: 'pn-api' }],
    ]);
    assert.deepStrictEqual(calls[0]?.slice(4), [300, 'Sum']);
  });

  it('passes period and statistic through when configured', async () => {
    const { calls } = await runMetrics({ ...BASE, periodSeconds: 60, stat: 'Average' });

    assert.deepStrictEqual(calls[0]?.slice(4), [60, 'Average']);
  });
});
