import type { AWSCloudWatchLogsTimeRange } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { LogRows } from './LogRows.js';

/**
 * Answers one Logs Insights query of the fake CloudWatch Logs service; throwing
 * makes the query fail, like an AWS error would.
 *
 * @param query - Query string
 * @param groups - Log groups of the query
 * @param timeRange - Time range of the query
 * @param index - Zero-based position of the query in the execution
 */
export type LogsResponderFn = (
  query: string,
  groups: ReadonlyArray<string>,
  timeRange: AWSCloudWatchLogsTimeRange,
  index: number,
) => LogRows;
