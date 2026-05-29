import type { AWSCloudWatchLogsQueryExecution, AWSCloudWatchLogsQueryStatistics } from '@go-automation/go-common/aws';

export interface CloudWatchLogsStepDiagnostics {
  readonly rowsReturned: number;
  readonly statistics: AWSCloudWatchLogsQueryStatistics;
  readonly queryExecutions: ReadonlyArray<AWSCloudWatchLogsQueryExecution>;
}

export interface StepDiagnostics {
  readonly cloudWatchLogs?: CloudWatchLogsStepDiagnostics;
}
