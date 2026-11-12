import type { AWSCloudWatchLogsQueryExecution } from '@pagopa/go-aws/cloudwatch-logs';
import type { AWSCloudWatchLogsQueryStatistics } from '@pagopa/go-aws/cloudwatch-logs/insights';

export interface CloudWatchLogsStepDiagnostics {
  readonly rowsReturned: number;
  readonly statistics: AWSCloudWatchLogsQueryStatistics;
  readonly queryExecutions: ReadonlyArray<AWSCloudWatchLogsQueryExecution>;
}

export interface StepDiagnostics {
  readonly cloudWatchLogs?: CloudWatchLogsStepDiagnostics;
}
