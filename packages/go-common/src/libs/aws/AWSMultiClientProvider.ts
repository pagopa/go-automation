/**
 * AWSMultiClientProvider - Manages multiple AWSClientProvider instances
 *
 * Provides access to AWS SDK clients across multiple profiles.
 * Each profile has its own lazy-initialized AWSClientProvider.
 */

import { AWSClientProvider } from './AWSClientProvider.js';
import { AWS_REGION } from './AWSRegion.js';

/**
 * Configuration options for AWSMultiClientProvider
 */
export interface AWSMultiClientProviderConfig {
  /** List of AWS SSO profile names. Empty/omitted means SDK default credential chain. */
  readonly profiles?: ReadonlyArray<string>;

  /** AWS region (defaults to eu-south-1) */
  readonly region?: string;
}

type AWSMultiClientOperationHandler<T> = (profile: string, clientProvider: AWSClientProvider) => Promise<T>;

const DEFAULT_CREDENTIAL_CHAIN_PROFILE = '__go_default_credential_chain__';
const DEFAULT_CREDENTIAL_CHAIN_PROFILE_NAME = 'default';

/**
 * Provides access to AWS SDK clients across multiple profiles.
 *
 * Each profile has its own AWSClientProvider that is lazily initialized
 * on first access. This allows efficient multi-account operations
 * while maintaining proper credential isolation.
 *
 * @example
 * ```typescript
 * const provider = new AWSMultiClientProvider({
 *   profiles: ['sso_pn-core-dev', 'sso_pn-core-uat', 'sso_pn-core-prod'],
 * });
 *
 * // Get client for specific profile
 * const devClient = provider.getClientProvider('sso_pn-core-dev');
 * const devDynamoDB = devClient.dynamoDB;
 *
 * // Iterate over all profiles
 * for (const profile of provider.profileNames) {
 *   console.log(`Processing profile: ${profile}`);
 *   const client = provider.getClientProvider(profile).dynamoDB;
 *   // ... use client
 * }
 *
 * // Cleanup when done
 * provider.close();
 * ```
 */
export class AWSMultiClientProvider {
  private readonly profiles: ReadonlyArray<string>;
  private readonly region: string;
  private readonly providers: Map<string, AWSClientProvider>;

  constructor(config: AWSMultiClientProviderConfig) {
    const configuredProfiles = (config.profiles ?? [])
      .map((profile) => profile.trim())
      .filter((profile) => profile.length > 0);

    this.profiles =
      configuredProfiles.length > 0
        ? [...new Set(configuredProfiles)] // Deduplicate
        : [DEFAULT_CREDENTIAL_CHAIN_PROFILE];
    this.region = config.region ?? AWS_REGION;
    this.providers = new Map();
  }

  /**
   * Returns the configured AWS profile names in resolution order.
   */
  get profileNames(): ReadonlyArray<string> {
    return this.profiles.map((profile) => this.toDisplayProfile(profile));
  }

  /**
   * Number of configured AWS profiles.
   */
  get size(): number {
    return this.profiles.length;
  }

  /**
   * Whether more than one AWS profile is configured.
   */
  get hasMultipleProfiles(): boolean {
    return this.profiles.length > 1;
  }

  /**
   * Returns the client provider for the first configured profile.
   *
   * This is the convenience path for scripts that only need one account
   * even though the underlying provider is multi-profile capable.
   */
  get first(): AWSClientProvider {
    const firstProfile = this.profiles[0];
    if (firstProfile === undefined) {
      throw new Error('At least one AWS profile must be provided');
    }
    return this.getClientProvider(firstProfile);
  }

  /**
   * Get an AWSClientProvider for a specific profile.
   * Creates the provider lazily on first access.
   *
   * @param profile - The AWS profile name
   * @returns The AWSClientProvider for the profile
   * @throws Error if the profile is not in the configured list
   */
  getClientProvider(profile: string): AWSClientProvider {
    const internalProfile = this.toInternalProfile(profile);
    if (internalProfile === undefined) {
      throw new Error(`Profile '${profile}' is not in the configured profiles: ${this.profileNames.join(', ')}`);
    }

    const provider =
      this.providers.get(internalProfile) ??
      new AWSClientProvider({
        ...(internalProfile !== DEFAULT_CREDENTIAL_CHAIN_PROFILE ? { profile: internalProfile } : {}),
        region: this.region,
      });
    this.providers.set(internalProfile, provider);

    return provider;
  }

  /**
   * Execute an operation across all profiles in parallel.
   *
   * @param operation - Async function to execute for each profile
   * @returns Map of profile names to operation results
   *
   * @example
   * ```typescript
   * const results = await provider.mapParallel(async (profile, clientProvider) => {
   *   const client = clientProvider.dynamoDB;
   *   return client.send(new ScanCommand({ TableName: 'my-table' }));
   * });
   *
   * for (const [profile, result] of results) {
   *   console.log(`Profile ${profile}: ${result.Count} items`);
   * }
   * ```
   */
  async mapParallel<T>(operation: AWSMultiClientOperationHandler<T>): Promise<Map<string, T>> {
    const results = new Map<string, T>();

    const promises = this.profiles.map(async (profile) => {
      const clientProvider = this.getClientProvider(profile);
      const displayProfile = this.toDisplayProfile(profile);
      const result = await operation(displayProfile, clientProvider);
      return { profile: displayProfile, result };
    });

    const settledResults = await Promise.all(promises);

    for (const { profile, result } of settledResults) {
      results.set(profile, result);
    }

    return results;
  }

  /**
   * Execute an operation across all profiles in parallel with error handling.
   * Unlike mapParallel, this method does not throw on individual failures.
   *
   * @param operation - Async function to execute for each profile
   * @returns Object with successful results and errors
   *
   * @example
   * ```typescript
   * const { results, errors } = await provider.mapParallelSettled(async (profile, client) => {
   *   return client.dynamoDB.send(new ScanCommand({ TableName: 'my-table' }));
   * });
   *
   * console.log(`Succeeded: ${results.size}, Failed: ${errors.size}`);
   * ```
   */
  async mapParallelSettled<T>(operation: AWSMultiClientOperationHandler<T>): Promise<{
    readonly results: Map<string, T>;
    readonly errors: Map<string, Error>;
  }> {
    const results = new Map<string, T>();
    const errors = new Map<string, Error>();

    const promises = this.profiles.map(async (profile) => {
      const displayProfile = this.toDisplayProfile(profile);
      try {
        const clientProvider = this.getClientProvider(profile);
        const result = await operation(displayProfile, clientProvider);
        return { profile: displayProfile, result, error: undefined };
      } catch (error) {
        return {
          profile: displayProfile,
          result: undefined,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    });

    const settledResults = await Promise.all(promises);

    for (const { profile, result, error } of settledResults) {
      if (error) {
        errors.set(profile, error);
      } else if (result !== undefined) {
        results.set(profile, result);
      }
    }

    return { results, errors };
  }

  /**
   * Close all cached client providers and release resources.
   * After calling this method, the provider should not be used.
   */
  close(): void {
    for (const provider of this.providers.values()) {
      provider.close();
    }
    this.providers.clear();
  }

  private toDisplayProfile(profile: string): string {
    return profile === DEFAULT_CREDENTIAL_CHAIN_PROFILE ? DEFAULT_CREDENTIAL_CHAIN_PROFILE_NAME : profile;
  }

  private toInternalProfile(profile: string): string | undefined {
    if (this.profiles.includes(profile)) {
      return profile;
    }

    if (
      profile === DEFAULT_CREDENTIAL_CHAIN_PROFILE_NAME &&
      this.profiles.length === 1 &&
      this.profiles[0] === DEFAULT_CREDENTIAL_CHAIN_PROFILE
    ) {
      return DEFAULT_CREDENTIAL_CHAIN_PROFILE;
    }

    return undefined;
  }
}
