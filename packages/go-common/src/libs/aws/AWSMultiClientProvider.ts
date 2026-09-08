/**
 * AWSMultiClientProvider - Manages multiple AWSClientProvider instances
 *
 * Provides access to AWS SDK clients across multiple profiles.
 * Each profile has its own lazy-initialized AWSClientProvider.
 */

import { AWSAccountProfileSet } from './AWSAccountProfileSet.js';
import { AWSClientProvider } from './AWSClientProvider.js';
import type { AWSExecutionTarget } from './AWSExecutionTarget.js';
import type { AWSProfileSet } from './AWSProfileSet.js';
import { AWS_REGION } from './AWSRegion.js';
import { AWSTargetNotConfiguredError } from './AWSTargetNotConfiguredError.js';

/**
 * Configuration options for AWSMultiClientProvider
 */
export interface AWSMultiClientProviderConfig {
  /** List of AWS SSO profile names. Empty/omitted means SDK default credential chain. */
  readonly profiles?: ReadonlyArray<string>;

  /** AWS region (defaults to eu-south-1) */
  readonly region?: string;

  /**
   * Per profile, where else its log groups may live: tokens are a profile name
   * or a 12-digit account id, as declared in `aws.profiles`.
   */
  readonly logFallbacksByProfile?: ReadonlyMap<string, ReadonlyArray<string>>;
}

type AWSMultiClientOperationHandler<T> = (profile: string, clientProvider: AWSClientProvider) => Promise<T>;

/** One profile's resolved account id, or the error that prevented resolving it. */
interface AWSProfileIdentity {
  readonly profile: string;
  readonly accountId?: string;
  readonly error?: Error;
}

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
export class AWSMultiClientProvider implements AWSProfileSet {
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
   * Returns the profiles that can read `target`.
   *
   * The one place that decides which credentials serve an account, so the
   * services built on the result never have to ask. A target no profile can
   * reach fails here instead of silently reading whichever account comes first
   * in configuration order: log group and table names repeat across
   * environments, so the wrong account answers successfully with no rows.
   *
   * @param target - Source account and region of the execution
   * @returns The narrowed set, or this provider when every profile matches
   * @throws AWSTargetNotConfiguredError when no profile can read the target
   */
  async profileSetFor(target: AWSExecutionTarget): Promise<AWSProfileSet> {
    const region = target.region.trim();
    if (region !== this.region) {
      throw new AWSTargetNotConfiguredError(
        'AWS_REGION_NOT_CONFIGURED',
        `AWS clients are configured for region ${this.region}, but the execution target is ${region}`,
      );
    }

    const accountId = target.accountId.trim();
    if (accountId === '') {
      throw new AWSTargetNotConfiguredError(
        'AWS_ACCOUNT_NOT_CONFIGURED',
        'The execution target carries no AWS account id, so no profile can be selected for it',
      );
    }

    const identities = await this.resolveIdentities();
    const matching = identities.filter((identity) => identity.accountId === accountId).map(({ profile }) => profile);
    if (matching.length > 0) {
      // Nothing narrowed: keep the identity, so callers can skip rebuilding.
      return matching.length === this.profiles.length ? this : new AWSAccountProfileSet(this, matching);
    }

    // A profile whose identity could not be checked may well be the right one:
    // saying "no profile resolves to that account" would be a guess, and would
    // hide the expired session that actually needs fixing.
    const unresolved = identities.filter((identity) => identity.error !== undefined);
    if (unresolved.length > 0) {
      const causes = unresolved.map(({ profile, error }) => `${profile}: ${error?.message ?? 'unknown error'}`);
      throw new AWSTargetNotConfiguredError(
        'AWS_PROFILE_IDENTITY_UNAVAILABLE',
        `No configured AWS profile could be matched to account ${accountId}, and the identity of ` +
          `${unresolved.length} of ${identities.length} profiles could not be resolved — ${causes.join('; ')}`,
      );
    }

    throw new AWSTargetNotConfiguredError(
      'AWS_ACCOUNT_NOT_CONFIGURED',
      `No configured AWS profile resolves to account ${accountId}. ` +
        `Configured profiles: ${this.profileNames.join(', ')}`,
    );
  }

  /**
   * Resolves every configured profile's account id in parallel, keeping the
   * failures instead of collapsing them into "no match".
   *
   * Not memoised: {@link AWSClientProvider.resolveAccountId} already
   * single-flights the successful lookups and drops the failed ones, so caching
   * here would pin a failure past the credential refresh that fixes it.
   *
   * @returns One entry per profile, carrying its account id or its error
   */
  /**
   * The account each configured profile's credentials belong to.
   *
   * Profiles whose identity cannot be resolved are omitted rather than failing
   * the lookup: the caller decides whether the missing one mattered.
   *
   * @returns Account id by profile name, in configuration order
   */
  async accountIdByProfile(): Promise<ReadonlyMap<string, string>> {
    const identities = await this.resolveIdentities();
    return new Map(
      identities
        .filter((identity): identity is AWSProfileIdentity & { accountId: string } => identity.accountId !== undefined)
        .map(({ profile, accountId }) => [profile, accountId]),
    );
  }

  private async resolveIdentities(): Promise<ReadonlyArray<AWSProfileIdentity>> {
    return await Promise.all(
      this.profileNames.map(async (profile): Promise<AWSProfileIdentity> => {
        try {
          return { profile, accountId: await this.getClientProvider(profile).resolveAccountId() };
        } catch (error: unknown) {
          return { profile, error: error instanceof Error ? error : new Error(String(error)) };
        }
      }),
    );
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
