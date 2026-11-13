import { AWSAccountProfileSet, type AWSActiveOperationRegistry, type AWSProfileSet } from '@pagopa/go-aws';
import { AWSCloudWatchLogsService } from '@pagopa/go-aws/cloudwatch-logs';
import type { AWSCloudWatchLogsQueryService, AWSCloudWatchLogsTarget } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { permissionSetOfArn } from '@pagopa/go-aws/profiles';

import { AwsAccountError } from '../../toolkits/common/accounts/AwsAccountError.js';
import { AwsAccountsDirectoryPort } from '../../toolkits/common/accounts/AwsAccountsDirectoryPort.js';
import type { AwsAccountsOccurrence } from '../../toolkits/common/accounts/AwsAccountsOccurrence.js';
import type { ResolvedAwsAccount } from '../../toolkits/common/accounts/ResolvedAwsAccount.js';
import type { RuntimeAwsAccountsPortOptions } from './RuntimeAwsAccountsPortOptions.js';

/** A configured profile and the account and permission set STS reports for it. */
interface ProfileIdentity {
  readonly profile: string;
  readonly accountId: string;
  readonly permissionSet: string | undefined;
}

/**
 * Account port of the runtime (EVO-AWSACCT-OPUS-01 §6.1): the directory logic
 * of {@link AwsAccountsDirectoryPort}, with readers built from real credentials.
 *
 * - `profiles`: among the configured profiles whose STS account is the account of
 *   the logical account, the first with a preferred permission set (then
 *   configuration order). Profile names never matter.
 * - `oam`: the monitoring reader, targeted at the account (cross-account by ARN).
 *
 * Every reader targets exactly the account and region, **without log fallbacks**,
 * so a missing log group can never be answered by another account.
 */
export class RuntimeAwsAccountsPort extends AwsAccountsDirectoryPort {
  /**
   * @param runtimeOptions - Directory, binding, credentials and occurrence of the execution
   */
  constructor(private readonly runtimeOptions: RuntimeAwsAccountsPortOptions) {
    super(runtimeOptions);
    if (runtimeOptions.binding === 'profiles' && runtimeOptions.profiles === undefined) {
      throw new Error('The profiles account binding needs the configured AWS profiles');
    }
    if (runtimeOptions.binding === 'oam' && runtimeOptions.monitoring === undefined) {
      throw new Error('The oam account binding needs the monitoring CloudWatch Logs reader');
    }
  }

  /**
   * Same configuration, bound to one occurrence and its remote operations.
   *
   * @param occurrence - Account and region of the occurrence
   * @param activeOperations - Remote operations of the occurrence
   * @returns A new port; this one is not modified
   */
  override bindToOccurrence(
    occurrence: AwsAccountsOccurrence,
    activeOperations: AWSActiveOperationRegistry,
  ): RuntimeAwsAccountsPort {
    return new RuntimeAwsAccountsPort({ ...this.runtimeOptions, occurrence, activeOperations });
  }

  /**
   * Builds the exact reader of one resolved logical account, without querying logs.
   *
   * @param account - Resolved logical account
   * @returns The reader
   * @throws AwsAccountError (`AWS_ACCOUNT_UNREACHABLE`) when no resolved identity is in the account and region
   * @throws Error when no profile is in the account and some identities could not be resolved (transient:
   *   retryable; the message names no profile, the details go to the local diagnostics)
   */
  protected override async createReader(account: ResolvedAwsAccount): Promise<AWSCloudWatchLogsQueryService> {
    const target: AWSCloudWatchLogsTarget = { accountId: account.accountId, region: account.region };
    const { monitoring, profiles, activeOperations } = this.runtimeOptions;
    if (this.runtimeOptions.binding === 'oam') {
      if (monitoring === undefined)
        throw new Error('The oam account binding needs the monitoring CloudWatch Logs reader');
      return monitoring.forTarget(target, activeOperations);
    }
    if (profiles === undefined) throw new Error('The profiles account binding needs the configured AWS profiles');
    const profileSet = profiles;
    const profile = await this.chooseProfile(profileSet, account);
    return this.createExactReader(new AWSAccountProfileSet(profileSet, [profile]), target);
  }

  /**
   * Reader bound to one profile and exactly one account and region, with no fallback sources.
   *
   * @param profileSet - The chosen profile
   * @param target - Account and region of the logical account
   * @returns The reader
   */
  protected createExactReader(
    profileSet: AWSProfileSet,
    target: AWSCloudWatchLogsTarget,
  ): AWSCloudWatchLogsQueryService {
    return new AWSCloudWatchLogsService(profileSet, target, this.runtimeOptions.activeOperations);
  }

  private async chooseProfile(profileSet: AWSProfileSet, account: ResolvedAwsAccount): Promise<string> {
    const settled = await Promise.allSettled(
      profileSet.profileNames.map(async (profile): Promise<ProfileIdentity> => {
        const identity = await profileSet.getClientProvider(profile).resolveIdentity();
        const permissionSet = identity.arn === undefined ? undefined : permissionSetOfArn(identity.arn);
        return { profile, accountId: identity.accountId, permissionSet };
      }),
    );
    const resolved = settled.flatMap((outcome) => (outcome.status === 'fulfilled' ? [outcome.value] : []));
    const inAccount = resolved.filter((identity) => identity.accountId === account.accountId);
    // A profile of another region would fail only at query time, after earlier steps read logs.
    const matching = inAccount.filter(
      (identity) => profileSet.getClientProvider(identity.profile).getRegion() === account.region,
    );
    const [chosen] = this.byPreference(matching);
    if (chosen !== undefined) {
      this.diagnose(`${account.account} in ${account.environment}: using profile ${chosen.profile}`);
      return chosen.profile;
    }

    const failures = settled.flatMap((outcome, index): string[] =>
      outcome.status === 'rejected'
        ? [
            `${profileSet.profileNames[index] ?? '?'}: ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`,
          ]
        : [],
    );
    if (failures.length > 0) {
      // A profile whose identity is unknown may be the right one: retryable. The causes name
      // profiles, so they go to the local diagnostics only, never into the propagated error.
      this.diagnose(
        `${account.account} in ${account.environment}: unresolved profile identities — ${failures.join('; ')}`,
      );
      throw new Error(
        `No configured AWS profile matched ${account.account} in ${account.environment}, and ` +
          `${String(failures.length)} profile identities could not be resolved (details in the local log)`,
      );
    }
    throw new AwsAccountError(
      'AWS_ACCOUNT_UNREACHABLE',
      inAccount.length === 0
        ? `No configured AWS profile reaches ${account.account} in ${account.environment} (account ${account.accountId})`
        : `No configured AWS profile reaches ${account.account} in ${account.environment} in region ${account.region}`,
    );
  }

  private diagnose(message: string): void {
    this.runtimeOptions.diagnostics?.(message);
  }

  /** Preferred permission sets first, in the configured order; then the rest, in configuration order. */
  private byPreference(identities: ReadonlyArray<ProfileIdentity>): ReadonlyArray<ProfileIdentity> {
    const preference = this.runtimeOptions.permissionSets ?? [];
    const rank = (identity: ProfileIdentity): number => {
      const index = identity.permissionSet === undefined ? -1 : preference.indexOf(identity.permissionSet);
      return index === -1 ? preference.length : index;
    };
    return identities.toSorted((a, b) => rank(a) - rank(b));
  }
}
