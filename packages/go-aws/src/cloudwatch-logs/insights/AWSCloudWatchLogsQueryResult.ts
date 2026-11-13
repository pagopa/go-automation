import type { AWSCloudWatchLogsQueryExecution } from './AWSCloudWatchLogsQueryExecution.js';
import type { AWSCloudWatchLogsQueryStatistics } from './AWSCloudWatchLogsQueryStatistics.js';
import type { GOLogsInsightsResultField } from './GOLogsInsightsResultField.js';

/** Rows of a Logs Insights query, with aggregated statistics and the executions that produced them. */
export interface AWSCloudWatchLogsQueryResult {
  readonly rows: ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;
  readonly statistics: AWSCloudWatchLogsQueryStatistics;
  readonly queryExecutions: ReadonlyArray<AWSCloudWatchLogsQueryExecution>;
}
