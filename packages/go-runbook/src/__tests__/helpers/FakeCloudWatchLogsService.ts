import type {
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryResult,
  AWSCloudWatchLogsTimeRange,
} from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { LoggedQuery } from './LoggedQuery.js';

/** CloudWatch Logs stub built by `fakeCloudWatchLogs`, for `createTestServiceRegistry`. */
export interface FakeCloudWatchLogsService {
  /** Every query received so far, in order. */
  readonly queries: ReadonlyArray<LoggedQuery>;
  queryWithStatistics(
    groups: ReadonlyArray<string>,
    query: string,
    timeRange: AWSCloudWatchLogsTimeRange,
    options?: AWSCloudWatchLogsQueryOptions,
  ): Promise<AWSCloudWatchLogsQueryResult>;
}
