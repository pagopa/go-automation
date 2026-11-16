/**
 * The AWS account and region an execution reads from.
 *
 * Resolved against the configured AWS profiles: the account must be one of
 * theirs. The cloud worker does not use this — it reaches source accounts
 * through an OAM link, with `AWSCloudWatchLogsTarget`.
 */
export interface AWSExecutionTarget {
  /** 12-digit AWS account id owning the resources to read. */
  readonly accountId: string;
  /** AWS region of those resources. Must match the configured client region. */
  readonly region: string;
}
