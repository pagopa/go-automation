import type { AWSCloudWatchLogsSource } from './AWSCloudWatchLogsSource.js';

/** Source account and region fixed for one OAM-backed execution. */
export interface AWSCloudWatchLogsTarget {
  readonly accountId?: string;
  readonly region: string;
  /** Profile bound to {@link accountId}, when the run holds its credentials. */
  readonly profile?: string;
  /**
   * Further places to look, in order, when the log group is not in
   * {@link accountId}.
   *
   * A product does not always keep the alarm and the log group in the same
   * account: SEND fires an alarm in one and writes the application logs in
   * another. The occurrence still names the account that fired, so without this
   * the query asks the wrong account and comes back as a configuration error.
   *
   * This is an allowlist, not a search: log group names repeat identically
   * across environments, so a name found in an account of another environment
   * would answer with the wrong data.
   */
  readonly fallbacks?: ReadonlyArray<AWSCloudWatchLogsSource>;
}
