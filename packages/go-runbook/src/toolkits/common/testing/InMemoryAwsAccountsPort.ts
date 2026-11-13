import type { AWSCloudWatchLogsQueryService } from '@pagopa/go-aws/cloudwatch-logs/insights';

import { AwsAccountError } from '../accounts/AwsAccountError.js';
import { AwsAccountsDirectoryPort } from '../accounts/AwsAccountsDirectoryPort.js';
import type { AwsAccountsOccurrence } from '../accounts/AwsAccountsOccurrence.js';
import type { ResolvedAwsAccount } from '../accounts/ResolvedAwsAccount.js';
import { createTestServiceRegistry } from './createTestServiceRegistry.js';
import type { InMemoryAwsAccountsPortOptions } from './InMemoryAwsAccountsPortOptions.js';

/**
 * Account port for tests (EVO-AWSACCT-OPUS-01 §5.5): the real directory logic
 * (environment, entries, aliases) with in-memory readers instead of AWS credentials.
 *
 * @example
 * ```typescript
 * const awsAccounts = new InMemoryAwsAccountsPort({
 *   directory: parseAwsAccountDirectory(['send/core/uat=000000000001']),
 *   region: 'eu-south-1',
 *   environment: 'uat',
 *   readers: { 'send/core': coreReader },
 * });
 * const services = createTestServiceRegistry({ awsAccounts });
 * ```
 */
export class InMemoryAwsAccountsPort extends AwsAccountsDirectoryPort {
  private readonly readersByAccount: Readonly<Record<string, AWSCloudWatchLogsQueryService>>;
  private readonly unreachable: ReadonlySet<string>;

  /**
   * @param options - Execution data, fake readers and unreachable accounts
   */
  constructor(private readonly inMemoryOptions: InMemoryAwsAccountsPortOptions) {
    super(inMemoryOptions);
    const options = inMemoryOptions;
    this.readersByAccount = options.readers ?? {};
    this.unreachable = new Set(options.unreachable ?? []);
  }

  /**
   * Returns the fake reader of the account, or fails like an account no profile reaches.
   *
   * @param account - Resolved logical account
   * @returns The fake reader
   */
  protected override async createReader(account: ResolvedAwsAccount): Promise<AWSCloudWatchLogsQueryService> {
    await Promise.resolve();
    if (this.unreachable.has(account.account)) {
      throw new AwsAccountError(
        'AWS_ACCOUNT_UNREACHABLE',
        `No configured credentials reach ${account.account} (${account.accountId}) in ${account.environment}`,
      );
    }
    return this.readersByAccount[account.account] ?? createTestServiceRegistry().cloudWatchLogs;
  }

  /**
   * Same fake configuration, bound to one occurrence, with no prepared reader.
   *
   * @param occurrence - Account and region of the occurrence
   * @returns A new in-memory port
   */
  override bindToOccurrence(occurrence: AwsAccountsOccurrence): InMemoryAwsAccountsPort {
    return new InMemoryAwsAccountsPort({ ...this.inMemoryOptions, occurrence });
  }
}
