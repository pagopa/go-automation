import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { MetricDatapoint, MetricDimension } from '@go-automation/go-common/aws';
import { CloudWatchMetricsStep } from '../CloudWatchMetricsStep.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../services/createTestServiceRegistry.js';

interface MetricsCall {
  readonly namespace: string;
  readonly metricName: string;
  readonly dimensions: ReadonlyArray<MetricDimension>;
  readonly periodSeconds: number | undefined;
  readonly stat: string | undefined;
}

const DATAPOINTS: ReadonlyArray<MetricDatapoint> = [{ timestamp: new Date('2026-01-01T00:00:00.000Z'), value: 7 }];

function makeContext(params: ReadonlyArray<readonly [string, string]>): {
  readonly context: RunbookContext;
  readonly calls: MetricsCall[];
} {
  const calls: MetricsCall[] = [];
  const services = createTestServiceRegistry({
    cloudWatchMetrics: {
      async getMetricData(
        namespace: string,
        metricName: string,
        dimensions: ReadonlyArray<MetricDimension>,
        _timeRange: unknown,
        periodSeconds?: number,
        stat?: string,
      ): Promise<ReadonlyArray<MetricDatapoint>> {
        calls.push({ namespace, metricName, dimensions, periodSeconds, stat });
        await Promise.resolve();
        return DATAPOINTS;
      },
    },
  });

  return {
    calls,
    context: {
      executionId: 'test',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      stepResults: new Map(),
      vars: new Map(),
      params: new Map(params),
      logs: [],
      services,
      recoveredErrors: [],
    },
  };
}

const TIME_PARAMS: ReadonlyArray<readonly [string, string]> = [
  ['alarmDatetime', '2026-01-01T00:00:00Z'],
  ['alarmDatetimeEnd', '2026-01-01T01:00:00Z'],
];

const base = {
  id: 'get-5xx',
  label: 'Get 5XX count',
  namespace: 'AWS/ApiGateway',
  metricName: '5XXError',
  dimensions: [{ name: 'ApiName', value: 'pn-delivery' }],
  timeRangeFromParams: { start: 'alarmDatetime', end: 'alarmDatetimeEnd' },
} as const;

describe('CloudWatchMetricsStep', () => {
  it('returns the datapoints from the metrics service', async () => {
    const { context } = makeContext(TIME_PARAMS);

    const result = await new CloudWatchMetricsStep(base).execute(context);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, DATAPOINTS);
  });

  it('forwards namespace, metric name and dimensions', async () => {
    const { context, calls } = makeContext(TIME_PARAMS);

    await new CloudWatchMetricsStep(base).execute(context);

    assert.strictEqual(calls[0]?.namespace, 'AWS/ApiGateway');
    assert.strictEqual(calls[0]?.metricName, '5XXError');
    assert.deepStrictEqual(calls[0]?.dimensions, [{ name: 'ApiName', value: 'pn-delivery' }]);
  });

  it('interpolates params into dimension values', async () => {
    const { context, calls } = makeContext([...TIME_PARAMS, ['apiName', 'pn-delivery-push']]);
    const step = new CloudWatchMetricsStep({ ...base, dimensions: [{ name: 'ApiName', value: '{{params.apiName}}' }] });

    await step.execute(context);

    assert.deepStrictEqual(calls[0]?.dimensions, [{ name: 'ApiName', value: 'pn-delivery-push' }]);
  });

  it('passes period and statistic through when configured', async () => {
    const { context, calls } = makeContext(TIME_PARAMS);

    await new CloudWatchMetricsStep({ ...base, periodSeconds: 60, stat: 'Average' }).execute(context);

    assert.strictEqual(calls[0]?.periodSeconds, 60);
    assert.strictEqual(calls[0]?.stat, 'Average');
  });
});
