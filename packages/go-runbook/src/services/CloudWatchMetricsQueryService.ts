import type { MetricDatapoint, MetricDimension } from '@go-automation/go-common/aws';

import type { TimeRange } from '../types/TimeRange.js';

/**
 * Structural contract for services capable of querying CloudWatch metrics.
 */
export interface CloudWatchMetricsQueryService {
  getMetricData(
    namespace: string,
    metricName: string,
    dimensions: ReadonlyArray<MetricDimension>,
    timeRange: TimeRange,
    periodSeconds?: number,
    stat?: string,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<MetricDatapoint>>;
}
