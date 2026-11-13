import type {
  AWSCloudWatchLogsQueryExecution,
  AWSCloudWatchLogsQueryStatistics,
} from '@pagopa/go-aws/cloudwatch-logs/insights';

/** CloudWatch Logs Insights statistics of the queries a step ran, kept in the trace. */
export interface CloudWatchLogsStepDiagnostics {
  /** Rows returned to the step. */
  readonly rowsReturned: number;
  /** Aggregated query statistics. */
  readonly statistics: AWSCloudWatchLogsQueryStatistics;
  /** One entry per query execution. */
  readonly queryExecutions: ReadonlyArray<AWSCloudWatchLogsQueryExecution>;
}
