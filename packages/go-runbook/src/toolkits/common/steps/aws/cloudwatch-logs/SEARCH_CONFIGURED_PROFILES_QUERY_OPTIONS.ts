import type { AWSCloudWatchLogsQueryOptions } from '@pagopa/go-aws/cloudwatch-logs/insights';

/**
 * Options of a read whose log group is searched among the configured profiles: the log groups of a product are named
 * per environment, or live in one of several accounts. The abort signal is added by `executeCloudWatchLogsQuery`.
 *
 * @example
 * ```typescript
 * await executeCloudWatchLogsQuery(context, [logGroup], query, range, SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS);
 * ```
 */
export const SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS: Readonly<Omit<AWSCloudWatchLogsQueryOptions, 'signal'>> = {
  logGroupResolutionMode: 'search-configured-profiles',
};
