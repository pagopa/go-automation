/**
 * Log group resolution strategy of a Logs Insights query.
 *
 * - `default-profile-only`: query only the first configured profile.
 * - `search-configured-profiles`: try configured profiles in order until the
 *   log group can be queried, caching successful resolutions.
 */
export type AWSCloudWatchLogsLogGroupResolutionMode = 'default-profile-only' | 'search-configured-profiles';
