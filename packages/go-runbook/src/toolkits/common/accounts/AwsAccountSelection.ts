import type { AwsLogicalAccount } from './AwsLogicalAccount.js';

/**
 * The logical accounts a step reads, and how an execution narrows them
 * (EVO-AWSACCT-OPUS-01 §5.4). Holds no account id, environment-specific data or credentials.
 */
export interface AwsAccountSelection {
  /** Name of the reader in error messages. */
  readonly subject: string;
  /** Logical accounts, in reading and tagging order. */
  readonly accounts: ReadonlyArray<AwsLogicalAccount>;
  /**
   * - `every-account`: every logical account, in the execution environment;
   * - `occurrence-account`: only the logical account of the occurrence (all of them without an occurrence).
   */
  readonly scope: 'every-account' | 'occurrence-account';
  /** Environments in which the step may read; absent means every environment. */
  readonly environments?: ReadonlyArray<string>;
}
