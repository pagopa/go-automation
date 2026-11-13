import type { AWSCloudWatchLogsQueryService } from '@pagopa/go-aws/cloudwatch-logs/insights';

import { AwsAccountError } from '../../toolkits/common/accounts/AwsAccountError.js';
import type { AwsLogicalAccount } from '../../toolkits/common/accounts/AwsLogicalAccount.js';
import type { ResolvedAwsAccount } from '../../toolkits/common/accounts/ResolvedAwsAccount.js';
import type { AwsAccountsPort } from '../../toolkits/common/services/ports/AwsAccountsPort.js';

/**
 * Account port of a host whose account configuration is invalid
 * (EVO-AWSACCT-OPUS-01 §6.4). A long-running host (the worker Lambda) keeps
 * serving runbooks without logical accounts; each runbook that declares them
 * fails before its first step with `AWS_ACCOUNT_DIRECTORY_INVALID`, a permanent
 * configuration failure of that execution only.
 */
export class UnavailableAwsAccountsPort implements AwsAccountsPort {
  /**
   * @param reason - Why the configuration is invalid (no profile names)
   */
  constructor(private readonly reason: string) {}

  /** @throws AwsAccountError (`AWS_ACCOUNT_DIRECTORY_INVALID`) */
  environment(): string {
    throw this.error();
  }

  /** @returns `false`: no occurrence can be matched against an invalid directory */
  hasOccurrence(): boolean {
    return false;
  }

  /** @throws AwsAccountError (`AWS_ACCOUNT_DIRECTORY_INVALID`) */
  resolve(account: AwsLogicalAccount): ResolvedAwsAccount {
    throw this.error(account);
  }

  /** @returns `undefined` */
  accountOfOccurrence(): AwsLogicalAccount | undefined {
    return undefined;
  }

  /** @throws AwsAccountError (`AWS_ACCOUNT_DIRECTORY_INVALID`) */
  async prepare(): Promise<void> {
    await Promise.resolve();
    throw this.error();
  }

  /** @throws AwsAccountError (`AWS_ACCOUNT_DIRECTORY_INVALID`) */
  cloudWatchLogsFor(account: AwsLogicalAccount): AWSCloudWatchLogsQueryService {
    throw this.error(account);
  }

  /** @returns No account: nothing was prepared */
  resolvedAccounts(): ReadonlyArray<ResolvedAwsAccount> {
    return [];
  }

  /** @returns This port: the configuration stays invalid for every occurrence */
  bindToOccurrence(): AwsAccountsPort {
    return this;
  }

  private error(account?: AwsLogicalAccount): AwsAccountError {
    return new AwsAccountError(
      'AWS_ACCOUNT_DIRECTORY_INVALID',
      `The account configuration (aws.account.*) is invalid${account === undefined ? '' : ` for ${account}`}: ${this.reason}`,
    );
  }
}
