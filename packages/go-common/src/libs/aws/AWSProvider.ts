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

  close(): void {
    this.cachedServiceProvider?.close();
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
