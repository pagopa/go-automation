import type { AWSCloudWatchLogsQueryStatistics } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { CloudWatchLogsTelemetryQueryExecution } from './CloudWatchLogsTelemetryQueryExecution.js';

export interface CloudWatchLogsTelemetry {
  readonly queryCount: number;
  readonly failedQueryCount?: number;
  readonly statistics: AWSCloudWatchLogsQueryStatistics;
  readonly queryExecutions: ReadonlyArray<CloudWatchLogsTelemetryQueryExecution>;
}
