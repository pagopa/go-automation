import type { AWSActiveOperationRegistry } from '@pagopa/go-aws';
import type { AWSCloudWatchLogsQueryService } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { AwsAccountsPort } from '../services/ports/AwsAccountsPort.js';
import { AwsAccountDirectoryIndex } from './AwsAccountDirectoryIndex.js';
import { AwsAccountError } from './AwsAccountError.js';
import type { AwsAccountsDirectoryPortOptions } from './AwsAccountsDirectoryPortOptions.js';
import type { AwsAccountsOccurrence } from './AwsAccountsOccurrence.js';
import type { AwsLogicalAccount } from './AwsLogicalAccount.js';
import type { ResolvedAwsAccount } from './ResolvedAwsAccount.js';

/**
 * {@link AwsAccountsPort} backed by an account directory (EVO-AWSACCT-OPUS-01
 * §5, §6.2). It derives the environment, resolves logical accounts and keeps the
 * prepared readers; subclasses only build the reader of one resolved account
 * (profiles matched through STS, OAM, or an in-memory fake).
 */
export abstract class AwsAccountsDirectoryPort implements AwsAccountsPort {
  private readonly index: AwsAccountDirectoryIndex;
  private readonly readers = new Map<AwsLogicalAccount, AWSCloudWatchLogsQueryService>();
  private readonly prepared: ResolvedAwsAccount[] = [];

  /**
   * @param options - Directory, region, occurrence and configured environment of the execution
   */
  constructor(private readonly options: AwsAccountsDirectoryPortOptions) {
    this.index = new AwsAccountDirectoryIndex(options.directory);
  }

  /**
   * Builds the reader of one resolved logical account, without querying logs.
   *
   * @param account - Resolved logical account
   * @returns The reader, bound exactly to the account
   * @throws AwsAccountError (`AWS_ACCOUNT_UNREACHABLE`) when no credentials reach the account
   */
  protected abstract createReader(account: ResolvedAwsAccount): Promise<AWSCloudWatchLogsQueryService>;

  /**
   * Same configuration, bound to one occurrence, with fresh execution state.
   *
   * @param occurrence - Account and region of the occurrence
   * @param activeOperations - Remote operations of the occurrence
   * @returns A new port of the same kind
   */
  abstract bindToOccurrence(
    occurrence: AwsAccountsOccurrence,
    activeOperations: AWSActiveOperationRegistry,
  ): AwsAccountsPort;

  /**
   * Environment of the execution.
   *
   * @returns The environment of the occurrence account, or the configured one
   * @throws AwsAccountError when the occurrence is outside the directory or the region, or no environment is configured
   */
  environment(): string {
    const { occurrence } = this.options;
    if (occurrence !== undefined) {
      if (occurrence.region !== this.options.region) {
        throw new AwsAccountError(
          'AWS_OCCURRENCE_ACCOUNT_MISMATCH',
          `The occurrence is in region ${occurrence.region}, but the execution reads region ${this.options.region}`,
        );
      }
      const environment = this.index.environmentOf(occurrence.accountId);
      if (environment === undefined) {
        throw new AwsAccountError(
          'AWS_OCCURRENCE_ACCOUNT_MISMATCH',
          `The occurrence account ${occurrence.accountId} is not in the account directory (aws.account.directory)`,
        );
      }
      return environment;
    }
    if (this.options.environment === undefined) {
      throw new AwsAccountError(
        'AWS_ACCOUNT_ENVIRONMENT_NOT_CONFIGURED',
        'The execution has no occurrence: set the environment to read (aws.account.environment)',
      );
    }
    return this.options.environment;
  }

  /**
   * @returns Whether the execution analyses an occurrence
   */
  hasOccurrence(): boolean {
    return this.options.occurrence !== undefined;
  }

  /**
   * Resolves a logical account in the environment of the execution.
   *
   * @param account - Logical account
   * @returns The resolved account
   * @throws AwsAccountError (`AWS_ACCOUNT_NOT_CONFIGURED`) when the directory has no entry for it
   */
  resolve(account: AwsLogicalAccount): ResolvedAwsAccount {
    const environment = this.environment();
    const accountId = this.index.accountIdOf(account, environment);
    if (accountId === undefined) {
      throw new AwsAccountError(
        'AWS_ACCOUNT_NOT_CONFIGURED',
        `The account directory (aws.account.directory) has no entry ${account}/${environment}`,
      );
    }
    return { account, environment, accountId, region: this.options.region };
  }

  /**
   * Logical account of the occurrence among the given ones.
   *
   * @param accounts - Candidate logical accounts
   * @returns The matching logical account, or `undefined`
   */
  accountOfOccurrence(accounts: ReadonlyArray<AwsLogicalAccount>): AwsLogicalAccount | undefined {
    const { occurrence } = this.options;
    if (occurrence === undefined) return undefined;
    const environment = this.environment();
    return accounts.find((account) => this.index.accountIdOf(account, environment) === occurrence.accountId);
  }

  /**
   * Prepares, once each, the readers of the logical accounts.
   *
   * @param accounts - Logical accounts the execution will read
   */
  async prepare(accounts: ReadonlyArray<AwsLogicalAccount>): Promise<void> {
    for (const account of accounts) {
      if (this.readers.has(account)) continue;
      const resolved = this.resolve(account);
      this.readers.set(account, await this.createReader(resolved));
      this.prepared.push(resolved);
    }
  }

  /**
   * Reader of a prepared logical account.
   *
   * @param account - Prepared logical account
   * @returns The reader
   * @throws Error when the account was not prepared (a step reading an undeclared account)
   */
  cloudWatchLogsFor(account: AwsLogicalAccount): AWSCloudWatchLogsQueryService {
    const reader = this.readers.get(account);
    if (reader === undefined) {
      throw new Error(`Logical account ${account} was not prepared: declare it in the step's accountSelections()`);
    }
    return reader;
  }

  /**
   * @returns The prepared logical accounts, in preparation order
   */
  resolvedAccounts(): ReadonlyArray<ResolvedAwsAccount> {
    return [...this.prepared];
  }
}
