import type { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import type { TimeRange } from '../types/TimeRange.js';

/**
 * A single metric datapoint.
 */
export interface MetricDatapoint {
  readonly timestamp: Date;
  readonly value: number;
}

/**
 * Dimension for metric queries.
 */
export interface MetricDimension {
  readonly name: string;
  readonly value: string;
}

/**
 * Service for querying CloudWatch Metrics.
 *
 * @example
 * ```typescript
 * const service = new CloudWatchMetricsService(client);
 * const datapoints = await service.getMetricData(
 *   'AWS/ApiGateway',
 *   '5XXError',
 *   [{ name: 'ApiName', value: 'my-api' }],
 *   { start: new Date('2024-01-01'), end: new Date('2024-01-02') },
 *   300,
 * );
 * ```
 */
export class CloudWatchMetricsService {
  constructor(private readonly client: CloudWatchClient) {}

  /**
   * Retrieves metric datapoints from CloudWatch.
   *
   * @param namespace - CloudWatch namespace (e.g. 'AWS/ApiGateway')
   * @param metricName - Metric name (e.g. '5XXError')
   * @param dimensions - Metric dimensions
   * @param timeRange - Time range for the query
   * @param periodSeconds - Aggregation period in seconds (default 300)
   * @param stat - Statistic to retrieve (default 'Sum')
   * @returns Array of metric datapoints
   */
  async getMetricData(
    namespace: string,
    metricName: string,
    dimensions: ReadonlyArray<MetricDimension>,
    timeRange: TimeRange,
    periodSeconds: number = 300,
    stat: string = 'Sum',
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
                Dimensions: dimensions.map((d) => ({
                  Name: d.name,
                  Value: d.value,
                })),
              },
              Period: periodSeconds,
              Stat: stat,
            },
          },
        ],
      }),
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
