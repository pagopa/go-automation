/**
 * Scan statistics of one or more CloudWatch Logs Insights queries.
 */
export interface AWSCloudWatchLogsQueryStatistics {
  readonly bytesScanned: number;
  readonly recordsScanned: number;
  readonly recordsMatched: number;
  readonly logGroupsScanned?: number;
  readonly estimatedBytesSkipped?: number;
  readonly estimatedRecordsSkipped?: number;
}
