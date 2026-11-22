import type { ExecutedCloudWatchLogsQuery } from './ExecutedCloudWatchLogsQuery.js';

/** A Logs Insights read that answered, or that failed and left only its `unavailable` coverage. */
export interface CloudWatchLogsReadAttempt extends ExecutedCloudWatchLogsQuery {
  readonly failure?: Error;
}
