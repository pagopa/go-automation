import type { AWSActiveOperationRegistry } from '../../AWSActiveOperationRegistry.js';

import type { AWSCloudWatchLogsQueryOptions } from './AWSCloudWatchLogsQueryOptions.js';
import type { AWSCloudWatchLogsQueryResult } from './AWSCloudWatchLogsQueryResult.js';
import type { AWSCloudWatchLogsTarget } from './AWSCloudWatchLogsTarget.js';
import type { AWSCloudWatchLogsTimeRange } from './AWSCloudWatchLogsTimeRange.js';
import type { GOLogsInsightsResultField } from './GOLogsInsightsResultField.js';

/**
 * SDK-free contract of a CloudWatch Logs Insights reader.
 *
 * `AWSCloudWatchLogsService` (`@pagopa/go-aws/cloudwatch-logs`) implements it.
 * Code that only needs to type the reader, such as the runbook engine, depends
 * on this interface and so does not need `@aws-sdk/client-cloudwatch-logs`,
 * not even in its declaration files.
 */
export interface AWSCloudWatchLogsQueryService {
  /**
   * Returns a reader bound to one OAM source target, without changing this one.
   *
   * @param target - Source account and region of the execution
   * @param activeOperations - Registry that tracks the queries started by the execution
   * @returns The target-scoped reader
   */
  forTarget(
    target: AWSCloudWatchLogsTarget,
    activeOperations?: AWSActiveOperationRegistry,
  ): AWSCloudWatchLogsQueryService;

  /**
   * Returns a reader bound to the active-operation registry of one execution.
   *
   * @param activeOperations - Registry that tracks the queries started by the execution
   * @returns The execution-scoped reader
   */
  forExecution(activeOperations: AWSActiveOperationRegistry): AWSCloudWatchLogsQueryService;

  /**
   * Independent readers for exactly the sources allowed by this reader's configuration.
   *
   * @returns One reader per source, keyed by account id or profile name
   */
  getConfiguredSources(): ReadonlyArray<{ readonly key: string; readonly service: AWSCloudWatchLogsQueryService }>;

  /**
   * Runs a query and returns only its rows.
   *
   * @param logGroups - Log groups to query
   * @param query - Logs Insights query string
   * @param timeRange - Absolute time range
   * @param options - Query options
   * @returns The result rows
   */
  query(
    logGroups: ReadonlyArray<string>,
    query: string,
    timeRange: AWSCloudWatchLogsTimeRange,
    options?: AWSCloudWatchLogsQueryOptions,
  ): Promise<ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>>;

  /**
   * Runs a query and returns rows, statistics and executions.
   *
   * @param logGroups - Log groups to query
   * @param query - Logs Insights query string
   * @param timeRange - Absolute time range
   * @param options - Query options
   * @returns Rows with aggregated statistics and the executions that produced them
   */
  queryWithStatistics(
    logGroups: ReadonlyArray<string>,
    query: string,
    timeRange: AWSCloudWatchLogsTimeRange,
    options?: AWSCloudWatchLogsQueryOptions,
  ): Promise<AWSCloudWatchLogsQueryResult>;
}
