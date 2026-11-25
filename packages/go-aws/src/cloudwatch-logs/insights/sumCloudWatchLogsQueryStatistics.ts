import type { AWSCloudWatchLogsQueryStatistics } from './AWSCloudWatchLogsQueryStatistics.js';

/**
 * Sums the scan statistics of several CloudWatch Logs Insights queries.
 * Optional counters appear in the result only if at least one input reports them.
 *
 * @param statistics - Per-query statistics
 * @returns The aggregated statistics
 */
export function sumCloudWatchLogsQueryStatistics(
  statistics: ReadonlyArray<AWSCloudWatchLogsQueryStatistics>,
): AWSCloudWatchLogsQueryStatistics {
  let bytesScanned = 0;
  let recordsScanned = 0;
  let recordsMatched = 0;
  let logGroupsScanned = 0;
  let estimatedBytesSkipped = 0;
  let estimatedRecordsSkipped = 0;
  let hasLogGroupsScanned = false;
  let hasEstimatedBytesSkipped = false;
  let hasEstimatedRecordsSkipped = false;

  for (const item of statistics) {
    bytesScanned += item.bytesScanned;
    recordsScanned += item.recordsScanned;
    recordsMatched += item.recordsMatched;
    if (item.logGroupsScanned !== undefined) {
      hasLogGroupsScanned = true;
      logGroupsScanned += item.logGroupsScanned;
    }
    if (item.estimatedBytesSkipped !== undefined) {
      hasEstimatedBytesSkipped = true;
      estimatedBytesSkipped += item.estimatedBytesSkipped;
    }
    if (item.estimatedRecordsSkipped !== undefined) {
      hasEstimatedRecordsSkipped = true;
      estimatedRecordsSkipped += item.estimatedRecordsSkipped;
    }
  }

  return {
    bytesScanned,
    recordsScanned,
    recordsMatched,
    ...(hasLogGroupsScanned ? { logGroupsScanned } : {}),
    ...(hasEstimatedBytesSkipped ? { estimatedBytesSkipped } : {}),
    ...(hasEstimatedRecordsSkipped ? { estimatedRecordsSkipped } : {}),
  };
}
