import type { AwsLogicalAccount } from './AwsLogicalAccount.js';

/**
 * Short name of a logical account, the part after the product (`send/core` → `core`):
 * the tag rows, variables and messages use (EVO-AWSACCT-OPUS-01 §5.6).
 *
 * @param account - Logical account
 * @returns The account name
 */
export function awsLogicalAccountName(account: AwsLogicalAccount): string {
  return account.slice(account.indexOf('/') + 1);
}
