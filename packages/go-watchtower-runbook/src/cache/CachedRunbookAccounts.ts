/**
 * Logical-account inputs of a cached execution (EVO-AWSACCT-OPUS-01 §6.5): the
 * same occurrence read with another directory, binding or credential preference
 * may read other accounts or fail differently.
 */
export interface CachedRunbookAccounts {
  /** `aws.account.binding`. */
  readonly binding: string;
  /** Environment resolved from the occurrence account. */
  readonly environment: string;
  /** Directory entries of the runbook's logical accounts in that environment, sorted by account. */
  readonly entries: ReadonlyArray<{ readonly account: string; readonly accountId: string }>;
  /** Preferred permission sets, in preference order. */
  readonly permissionSets: ReadonlyArray<string>;
  /** Configured profiles, in configuration order: it breaks ties between profiles of one account. */
  readonly profiles: ReadonlyArray<string>;
}
