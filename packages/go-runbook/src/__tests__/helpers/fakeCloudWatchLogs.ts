import type {
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryResult,
  AWSCloudWatchLogsTimeRange,
} from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { FakeCloudWatchLogsService } from './FakeCloudWatchLogsService.js';
import type { LoggedQuery } from './LoggedQuery.js';
import type { LogsResponderFn } from './LogsResponderFn.js';

/**
 * Fake CloudWatch Logs service answering every Logs Insights query with
 * `respond` and recording the queries it receives.
 *
 * @param respond - Rows of each query
 * @returns A `cloudWatchLogs` stub for `createTestServiceRegistry`
 *
 * @example
 * ```typescript
 * const services = createTestServiceRegistry({ cloudWatchLogs: fakeCloudWatchLogs(() => rows) });
 * ```
 */
export function fakeCloudWatchLogs(respond: LogsResponderFn): FakeCloudWatchLogsService {
  const queries: LoggedQuery[] = [];
  return {
    queries,
    async queryWithStatistics(
      groups: ReadonlyArray<string>,
      query: string,
      timeRange: AWSCloudWatchLogsTimeRange,
      options?: AWSCloudWatchLogsQueryOptions,
    ): Promise<AWSCloudWatchLogsQueryResult> {
      await Promise.resolve();
      const index = queries.length;
      const resolutionMode = options?.logGroupResolutionMode;
      queries.push({ groups, query, ...(resolutionMode === undefined ? {} : { resolutionMode }) });
      const rows = respond(query, groups, timeRange, index);
      return {
        rows,
        statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
        queryExecutions: [],
      };
    },
  };
}
