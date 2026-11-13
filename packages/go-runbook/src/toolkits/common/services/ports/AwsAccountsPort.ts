import type { AWSActiveOperationRegistry } from '@pagopa/go-aws';
import type { AWSCloudWatchLogsQueryService } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { AwsAccountsOccurrence } from '../../accounts/AwsAccountsOccurrence.js';
import type { AwsLogicalAccount } from '../../accounts/AwsLogicalAccount.js';
import type { ResolvedAwsAccount } from '../../accounts/ResolvedAwsAccount.js';

/**
 * Access of an execution to the logical AWS accounts its steps declare
 * (EVO-AWSACCT-OPUS-01 §5.5). Bound to one execution (occurrence, region,
 * account directory). It exposes no profile and no permission set: credentials
 * stay in the runtime implementation.
 */
export interface AwsAccountsPort {
  /**
   * Environment of the execution: the one of the occurrence account, or the configured one.
   *
   * @returns The environment
   * @throws AwsAccountError (`AWS_OCCURRENCE_ACCOUNT_MISMATCH`, `AWS_ACCOUNT_ENVIRONMENT_NOT_CONFIGURED`)
   */
  environment(): string;

  /**
   * @returns Whether the execution analyses an occurrence (it carries its account)
   */
  hasOccurrence(): boolean;

  /**
   * Account id and region of a logical account in the environment of the execution.
   *
   * @param account - Logical account
   * @returns The resolved account
   * @throws AwsAccountError (`AWS_ACCOUNT_NOT_CONFIGURED`) when the directory has no entry for it
   */
  resolve(account: AwsLogicalAccount): ResolvedAwsAccount;

  /**
   * Logical account, among the given ones, whose account is the occurrence account.
   *
   * @param accounts - Candidate logical accounts
   * @returns The matching logical account, or `undefined` without an occurrence or a match
   */
  accountOfOccurrence(accounts: ReadonlyArray<AwsLogicalAccount>): AwsLogicalAccount | undefined;

  /**
   * Prepares the readers of the logical accounts, without querying logs.
   *
   * @param accounts - Logical accounts the execution will read
   * @throws AwsAccountError (`AWS_ACCOUNT_NOT_CONFIGURED`, `AWS_ACCOUNT_UNREACHABLE`)
   */
  prepare(accounts: ReadonlyArray<AwsLogicalAccount>): Promise<void>;

  /**
   * CloudWatch Logs reader of a prepared logical account: exactly its account, no fallback.
   *
   * @param account - Prepared logical account
   * @returns The reader
   */
  cloudWatchLogsFor(account: AwsLogicalAccount): AWSCloudWatchLogsQueryService;

  /**
   * @returns The logical accounts prepared in this execution, in preparation order
   */
  resolvedAccounts(): ReadonlyArray<ResolvedAwsAccount>;

  /**
   * Same configuration, bound to one occurrence, with fresh execution state
   * (no prepared reader is shared with this port).
   *
   * @param occurrence - Account and region of the occurrence
   * @param activeOperations - Remote operations of the occurrence, stopped by the caller
   * @returns A new port; this one is not modified
   */
  bindToOccurrence(occurrence: AwsAccountsOccurrence, activeOperations: AWSActiveOperationRegistry): AwsAccountsPort;
}
