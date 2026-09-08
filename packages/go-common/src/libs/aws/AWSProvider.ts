import type { AWSExecutionTarget } from './AWSExecutionTarget.js';
import { AWSMultiClientProvider } from './AWSMultiClientProvider.js';
import type { AWSMultiClientProviderConfig } from './AWSMultiClientProvider.js';
import { AWSClientsProvider } from './AWSClientsProvider.js';
import { AWSServiceProvider } from './AWSServiceProvider.js';
import type { AWSCloudWatchLogsService, AWSCloudWatchLogsSource } from './AWSCloudWatchLogsService.js';

/**
 * Unified AWS facade exposed by GOScript.
 *
 * - `clients`: raw AWS SDK clients and multi-profile helpers.
 * - `services`: higher-level AWS operation wrappers.
 */
export class AWSProvider {
  private readonly multiClientProviderConfig: AWSMultiClientProviderConfig;
  private cachedMultiClientProvider: AWSMultiClientProvider | undefined;
  private cachedClientsProvider: AWSClientsProvider | undefined;
  private cachedServiceProvider: AWSServiceProvider | undefined;
  private readonly targetServiceProviders = new Map<string, Promise<AWSServiceProvider>>();

  constructor(config: AWSMultiClientProviderConfig) {
    this.multiClientProviderConfig = {
      ...(config.profiles !== undefined ? { profiles: [...config.profiles] } : {}),
      ...(config.region !== undefined ? { region: config.region } : {}),
      ...(config.logFallbacksByProfile === undefined
        ? {}
        : { logFallbacksByProfile: new Map(config.logFallbacksByProfile) }),
    };
  }

  get clients(): AWSClientsProvider {
    this.cachedClientsProvider ??= new AWSClientsProvider(this.multiClientProvider);
    return this.cachedClientsProvider;
  }

  get services(): AWSServiceProvider {
    this.cachedServiceProvider ??= new AWSServiceProvider(this.multiClientProvider);
    return this.cachedServiceProvider;
  }

  /**
   * Returns the services bound to one AWS account and region.
   *
   * The composition root owns this: it knows both the profiles and the services
   * built on them, so neither has to. Memoised per target as a promise, not as
   * a settled value, so concurrent occurrences of one account share a single
   * identity lookup and a single set of services — which is also what keeps the
   * CloudWatch Logs log group resolution cache warm. A failed resolution is
   * dropped, never cached: refreshed credentials must be able to recover it.
   *
   * @param target - Source account and region to read
   * @returns Services whose every AWS client belongs to that account
   * @throws AWSTargetNotConfiguredError when no profile can read the target
   */
  async servicesFor(target: AWSExecutionTarget): Promise<AWSServiceProvider> {
    const key = `${target.accountId.trim()}|${target.region.trim()}`;
    const cached = this.targetServiceProviders.get(key);
    if (cached !== undefined) return await cached;

    const pending = this.buildServicesFor(target);
    this.targetServiceProviders.set(key, pending);
    try {
      return await pending;
    } catch (error: unknown) {
      if (this.targetServiceProviders.get(key) === pending) this.targetServiceProviders.delete(key);
      throw error;
    }
  }

  private async buildServicesFor(target: AWSExecutionTarget): Promise<AWSServiceProvider> {
    const profileSet = await this.multiClientProvider.profileSetFor(target);
    const cloudWatchLogs = await this.buildCloudWatchLogsFor(target, profileSet.profileNames[0]);
    if (cloudWatchLogs !== undefined) return new AWSServiceProvider(profileSet, cloudWatchLogs);
    return profileSet === this.multiClientProvider ? this.services : new AWSServiceProvider(profileSet);
  }

  /**
   * Binds CloudWatch Logs to the places the occurrence's account declared, or
   * returns `undefined` when it declared none — leaving the composition, and
   * the behaviour, exactly as it was.
   *
   * The service is built on the *full* profile set rather than the narrowed
   * one: reading a fallback with its own credentials needs a profile that the
   * account-scoped set does not contain.
   *
   * @param target - Account and region of the occurrence
   * @param occurrenceProfile - First profile bound to that account
   * @returns The bound Logs service, or `undefined` when nothing was declared
   * @throws Error when a declared fallback names an unknown profile
   */
  private async buildCloudWatchLogsFor(
    target: AWSExecutionTarget,
    occurrenceProfile: string | undefined,
  ): Promise<AWSCloudWatchLogsService | undefined> {
    const declared = this.multiClientProviderConfig.logFallbacksByProfile;
    if (declared === undefined || declared.size === 0 || occurrenceProfile === undefined) return undefined;
    const tokens = declared.get(occurrenceProfile);
    if (tokens === undefined || tokens.length === 0) return undefined;

    const accountByProfile = await this.multiClientProvider.accountIdByProfile();
    const profileByAccount = new Map<string, string>();
    for (const [profile, accountId] of accountByProfile) {
      // Configuration order wins, so a stable profile answers for the account.
      if (!profileByAccount.has(accountId)) profileByAccount.set(accountId, profile);
    }

    const fallbacks: AWSCloudWatchLogsSource[] = tokens.map((token) => {
      const accountId = /^\d{12}$/.test(token) ? token : accountByProfile.get(token);
      if (accountId === undefined) {
        throw new Error(
          `AWS profile "${occurrenceProfile}" declares the log fallback "${token}", ` +
            `which is neither a 12-digit account id nor a configured profile whose identity could be resolved`,
        );
      }
      const profile = profileByAccount.get(accountId);
      return { accountId, ...(profile === undefined ? {} : { profile }) };
    });

    return this.services.cloudWatchLogs.forTarget({
      accountId: target.accountId,
      region: target.region,
      profile: occurrenceProfile,
      fallbacks,
    });
  }

  close(): void {
    this.cachedServiceProvider?.close();
    this.targetServiceProviders.clear();
    this.cachedMultiClientProvider?.close();
    this.cachedMultiClientProvider = undefined;
    this.cachedClientsProvider = undefined;
    this.cachedServiceProvider = undefined;
  }

  private get multiClientProvider(): AWSMultiClientProvider {
    this.cachedMultiClientProvider ??= new AWSMultiClientProvider(this.multiClientProviderConfig);
    return this.cachedMultiClientProvider;
  }
}
