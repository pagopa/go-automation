import type { AWSCloudWatchLogsQueryStatistics } from '@go-automation/go-common/aws';

export interface RunbookTelemetry {
  readonly cloudWatchLogs?: CloudWatchLogsTelemetry;
}

export interface CloudWatchLogsTelemetry {
  readonly queryCount: number;
  readonly statistics: AWSCloudWatchLogsQueryStatistics;
  readonly queryExecutions: ReadonlyArray<CloudWatchLogsTelemetryQueryExecution>;
}

export interface CloudWatchLogsTelemetryQueryExecution {
  readonly stepId: string;
  readonly stepLabel: string;
  readonly executionOrder: number;
  readonly queryId: string;
  readonly profile: string;
  readonly logGroups: ReadonlyArray<string>;
  readonly statistics: AWSCloudWatchLogsQueryStatistics;
}
