import type { AWSExecutionTarget } from './AWSExecutionTarget.js';
import { AWSMultiClientProvider } from './AWSMultiClientProvider.js';
import type { AWSMultiClientProviderConfig } from './AWSMultiClientProvider.js';
import { AWSClientsProvider } from './AWSClientsProvider.js';
import { AWSServiceProvider } from './AWSServiceProvider.js';

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
    return profileSet === this.multiClientProvider ? this.services : new AWSServiceProvider(profileSet);
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
