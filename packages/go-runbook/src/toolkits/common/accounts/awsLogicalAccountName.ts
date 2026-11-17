import type { AwsLogicalAccount } from './AwsLogicalAccount.js';

/**
 * Short name of a logical account, the part after the product (`send/core` → `core`):
 * the tag rows, variables and messages use.
 *
 * @param account - Logical account
 * @returns The account name
 */
export function awsLogicalAccountName(account: AwsLogicalAccount): string {
  return account.slice(account.indexOf('/') + 1);
}
