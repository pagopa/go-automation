import type { AwsAccountSource } from './AwsAccountSource.js';

/**
 * The accounts a multi-account step reads and how an execution narrows them
 * (EVO-RBREORG-OPUS-01 P30). Provisional: replaced by {@link AwsAccountSelection}
 * of logical accounts and removed in EVO-AWSACCT-OPUS-01 A4.
 */
export interface AwsAccountSourceSelection {
  /** Name of the reader in error messages. */
  readonly subject: string;
  /** Accounts the step knows; an occurrence in any other account is rejected. */
  readonly accounts: ReadonlyArray<AwsAccountSource>;
  /**
   * Which accounts an execution with an occurrence account reads:
   * - `every-account`: all of them, through OAM where no local profile is configured;
   * - `occurrence-account`: only the occurrence account.
   * Without an occurrence account every account is read and each needs a configured profile.
   */
  readonly scope: 'every-account' | 'occurrence-account';
  /** Region used when the execution does not set `awsRegion`. */
  readonly defaultRegion: string;
  /** When true, an execution in any other region is rejected. */
  readonly restrictToDefaultRegion?: boolean;
}
