import type { AWSRemoteCleanupWarningHandler } from '../../AWSActiveOperationRegistry.js';

import type { AWSCloudWatchLogsLogGroupResolutionMode } from './AWSCloudWatchLogsLogGroupResolutionMode.js';

/** Options of a Logs Insights query. */
export interface AWSCloudWatchLogsQueryOptions {
  /** Abort signal to cancel the query. */
  readonly signal?: AbortSignal;
  /** Override max poll attempts (default from `GOPollingPolicies.cloudWatchLogsQuery()`). */
  readonly maxPollAttempts?: number;
  /**
   * When true, fetch every available GetQueryResults page for a completed
   * CloudWatch Logs Insights query. Disabled by default to preserve the
   * previous single-page behaviour for existing scripts.
   */
  readonly paginateResults?: boolean;
  /** Page size for paginated GetQueryResults calls. Default and max: 10,000. */
  readonly queryResultsPageSize?: number;
  /** Safety cap for paginated GetQueryResults calls. Default: 10 pages (100,000 rows max). */
  readonly maxResultPages?: number;
  /**
   * Log group resolution strategy.
   *
   * - `default-profile-only`: query only the first configured profile.
   * - `search-configured-profiles`: try configured profiles in order until
   *   the log group can be queried, caching successful resolutions.
   */
  readonly logGroupResolutionMode?: AWSCloudWatchLogsLogGroupResolutionMode;
  /** Receives bounded cleanup warnings without changing the runbook outcome. */
  readonly onCleanupWarning?: AWSRemoteCleanupWarningHandler;
}
