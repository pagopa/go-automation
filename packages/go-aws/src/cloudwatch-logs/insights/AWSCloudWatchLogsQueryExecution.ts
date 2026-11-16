import type { AWSCloudWatchLogsQueryStatistics } from './AWSCloudWatchLogsQueryStatistics.js';

/** One Logs Insights query actually run, with the profile and log groups it used. */
export interface AWSCloudWatchLogsQueryExecution {
  readonly queryId: string;
  readonly profile: string;
  readonly logGroups: ReadonlyArray<string>;
  readonly statistics: AWSCloudWatchLogsQueryStatistics;
}
