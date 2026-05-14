import type { ResultField, AWSCloudWatchLogsQueryOptions } from '@go-automation/go-common/aws';

import type { TimeRange } from '../types/TimeRange.js';

/**
 * Structural contract for services capable of executing CloudWatch Logs
 * Insights queries.
 */
export interface CloudWatchLogsQueryService {
  query(
    logGroups: ReadonlyArray<string>,
    query: string,
    timeRange: TimeRange,
    options?: AWSCloudWatchLogsQueryOptions,
  ): Promise<ReadonlyArray<ReadonlyArray<ResultField>>>;
}
