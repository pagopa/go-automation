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
  /** List of AWS SSO profile names */
  readonly profiles: ReadonlyArray<string>;

  /** AWS region (defaults to eu-south-1) */
  readonly region?: string;
}

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
 * for (const [profile, clientProvider] of provider.entries()) {
 *   console.log(`Processing profile: ${profile}`);
 *   const client = clientProvider.dynamoDB;
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
    if (config.profiles.length === 0) {
      throw new Error('At least one AWS profile must be provided');
    }

    this.profiles = [...new Set(config.profiles)]; // Deduplicate
    this.region = config.region ?? AWS_REGION;
    this.providers = new Map();
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
    if (!this.profiles.includes(profile)) {
      throw new Error(
        `Profile '${profile}' is not in the configured profiles: ${this.profiles.join(', ')}`,
      );
    }

    const provider =
      this.providers.get(profile) ?? new AWSClientProvider({ profile, region: this.region });
    this.providers.set(profile, provider);

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
  async mapParallel<T>(
    operation: (profile: string, clientProvider: AWSClientProvider) => Promise<T>,
  ): Promise<Map<string, T>> {
    const results = new Map<string, T>();

    const promises = this.profiles.map(async (profile) => {
      const clientProvider = this.getClientProvider(profile);
      const result = await operation(profile, clientProvider);
      return { profile, result };
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
  async mapParallelSettled<T>(
    operation: (profile: string, clientProvider: AWSClientProvider) => Promise<T>,
  ): Promise<{
    readonly results: Map<string, T>;
    readonly errors: Map<string, Error>;
  }> {
    const results = new Map<string, T>();
    const errors = new Map<string, Error>();

    const promises = this.profiles.map(async (profile) => {
      try {
        const clientProvider = this.getClientProvider(profile);
        const result = await operation(profile, clientProvider);
        return { profile, result, error: undefined };
      } catch (error) {
        return {
          profile,
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
}
