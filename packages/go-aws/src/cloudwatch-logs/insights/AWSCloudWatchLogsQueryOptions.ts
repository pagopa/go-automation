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
  /**
   * When true, a failed or truncated read no longer discards what was already read:
   *
   * - the rows of the physical queries and of the pages that succeeded are returned;
   * - pages left unread are reported on their execution (`unreadPages`);
   * - a read that fails after every candidate profile or account was tried is reported in `failedReads`.
   *
   * Aborting and configuration errors of the target still throw. Disabled by default: callers that only read rows
   * keep the exceptions.
   */
  readonly partialResults?: boolean;
  /** Receives bounded cleanup warnings without changing the runbook outcome. */
  readonly onCleanupWarning?: AWSRemoteCleanupWarningHandler;
}
