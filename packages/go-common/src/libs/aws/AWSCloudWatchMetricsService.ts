import { GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import type { CloudWatchClient } from '@aws-sdk/client-cloudwatch';

import type { MetricDatapoint } from './models/MetricDatapoint.js';
import type { MetricDimension } from './models/MetricDimension.js';

/**
 * Service for querying CloudWatch Metrics.
 *
 * @example
 * ```typescript
 * const service = new AWSCloudWatchMetricsService(script.aws.clients.cloudWatch);
 * const datapoints = await service.getMetricData(
 *   'AWS/ApiGateway',
 *   '5XXError',
 *   [{ name: 'ApiName', value: 'my-api' }],
 *   { start: new Date('2026-01-01'), end: new Date('2026-01-02') },
 * );
 * ```
 */
export class AWSCloudWatchMetricsService {
  constructor(private readonly client: CloudWatchClient) {}

  /**
   * Retrieves metric datapoints from CloudWatch.
   *
   * @param namespace - CloudWatch namespace, e.g. `AWS/ApiGateway`
   * @param metricName - Metric name, e.g. `5XXError`
   * @param dimensions - Metric dimensions
   * @param timeRange - Time range for the query
   * @param periodSeconds - Aggregation period in seconds
   * @param stat - Statistic to retrieve
   * @param signal - Optional abort signal to cancel the request
   * @returns Metric datapoints
   */
  async getMetricData(
    namespace: string,
    metricName: string,
    dimensions: ReadonlyArray<MetricDimension>,
    timeRange: { readonly start: Date; readonly end: Date },
    periodSeconds: number = 300,
    stat: string = 'Sum',
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<MetricDatapoint>> {
    const response = await this.client.send(
      new GetMetricDataCommand({
        StartTime: timeRange.start,
        EndTime: timeRange.end,
        MetricDataQueries: [
          {
            Id: 'query',
            MetricStat: {
              Metric: {
                Namespace: namespace,
                MetricName: metricName,
                Dimensions: dimensions.map((dimension) => ({
                  Name: dimension.name,
                  Value: dimension.value,
                })),
              },
              Period: periodSeconds,
              Stat: stat,
            },
          },
        ],
      }),
      ...(signal !== undefined ? [{ abortSignal: signal }] : []),
    );

    const results = response.MetricDataResults?.[0];
    if (results === undefined) {
      return [];
    }

    const timestamps = results.Timestamps ?? [];
    const values = results.Values ?? [];
    const datapoints: MetricDatapoint[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i];
      const value = values[i];
      if (timestamp !== undefined && value !== undefined) {
        datapoints.push({ timestamp, value });
      }
    }

    return datapoints;
  }
}
