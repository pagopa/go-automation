import type { AWSAccountDirectoryEntry } from '@pagopa/go-aws/profiles';

import type { AwsLogicalAccount } from './AwsLogicalAccount.js';

/**
 * Lookups over a validated account directory (EVO-AWSACCT-OPUS-01 §5.3).
 * The entries come from `parseAwsAccountDirectory`, which guarantees one
 * environment per account id.
 */
export class AwsAccountDirectoryIndex {
  private readonly accountIds = new Map<string, string>();
  private readonly environments = new Map<string, string>();

  /**
   * @param entries - Validated directory entries
   */
  constructor(entries: ReadonlyArray<AWSAccountDirectoryEntry>) {
    for (const entry of entries) {
      this.accountIds.set(`${entry.logicalAccount}/${entry.environment}`, entry.accountId);
      this.environments.set(entry.accountId, entry.environment);
    }
  }

  /**
   * @param accountId - AWS account id
   * @returns The environment the account belongs to, or `undefined` if not in the directory
   */
  environmentOf(accountId: string): string | undefined {
    return this.environments.get(accountId);
  }

  /**
   * @param account - Logical account
   * @param environment - Environment
   * @returns The account id of the logical account in the environment, or `undefined`
   */
  accountIdOf(account: AwsLogicalAccount, environment: string): string | undefined {
    return this.accountIds.get(`${account}/${environment}`);
  }
}
