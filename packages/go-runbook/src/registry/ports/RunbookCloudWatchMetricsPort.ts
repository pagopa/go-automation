import type { TimeRange } from '../../types/TimeRange.js';

import type { RunbookMetricDatapoint } from './RunbookMetricDatapoint.js';
import type { RunbookMetricDimension } from './RunbookMetricDimension.js';

/**
 * CloudWatch metric operations a runbook may use, without SDK types.
 *
 * `AWSCloudWatchMetricsService` (`@pagopa/go-aws/cloudwatch-metrics`) satisfies
 * it structurally, so the engine's declaration files do not need
 * `@aws-sdk/client-cloudwatch`.
 */
export interface RunbookCloudWatchMetricsPort {
  /**
   * Reads the datapoints of one metric.
   *
   * @param namespace - Metric namespace
   * @param metricName - Metric name
   * @param dimensions - Metric dimensions
   * @param timeRange - Absolute time range
   * @param periodSeconds - Aggregation period
   * @param stat - Statistic (e.g. `Sum`, `Average`)
   * @param signal - Abort signal of the runbook execution
   * @returns The datapoints
   */
  getMetricData(
    namespace: string,
    metricName: string,
    dimensions: ReadonlyArray<RunbookMetricDimension>,
    timeRange: TimeRange,
    periodSeconds?: number,
    stat?: string,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<RunbookMetricDatapoint>>;
}
