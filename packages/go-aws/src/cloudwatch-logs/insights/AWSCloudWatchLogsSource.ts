/**
 * A place a log group may live, and how its credentials are obtained.
 *
 * When {@link profile} is set the log group is read directly by name with that
 * profile: holding credentials for the owning account is both cheaper and less
 * demanding than an OAM link. Without it the group is read as a cross-account
 * ARN through the OAM links of the first configured profile, which is the only
 * option for an AWS-managed worker, since it runs on a task role and has no
 * profiles to name.
 */
export interface AWSCloudWatchLogsSource {
  /** Account owning the log group. */
  readonly accountId: string;
  /** Configured profile whose credentials belong to {@link accountId}. */
  readonly profile?: string;
}
