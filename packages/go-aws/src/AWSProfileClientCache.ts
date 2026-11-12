import { GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { fromIni } from '@aws-sdk/credential-provider-ini';

import type { AWSClientBaseConfig } from './AWSClientBaseConfig.js';
import type { AWSClientFactory } from './AWSClientFactory.js';
import type { AWSClientProviderConfig } from './AWSClientProviderConfig.js';
import type { AWSDestroyableClient } from './AWSDestroyableClient.js';
import type { AWSProfileClients } from './AWSProfileClients.js';
import { AWS_REGION } from './AWSRegion.js';
import { STS_CLIENT } from './STS_CLIENT.js';

/**
 * Lazy cache of the AWS SDK clients of one profile.
 *
 * Clients are created on first request through their factory and reused until
 * {@link close}. The cache imports no service SDK: each factory brings its own,
 * so only the services actually used are loaded.
 *
 * @example
 * ```typescript
 * import { AWSProfileClientCache } from '@pagopa/go-aws';
 * import { S3_CLIENT } from '@pagopa/go-aws/s3';
 *
 * const clients = new AWSProfileClientCache({ profile: 'sso_pn-core-prod' });
 * const s3 = clients.client(S3_CLIENT);
 * clients.close();
 * ```
 */
export class AWSProfileClientCache implements AWSProfileClients {
  private readonly profile: string | undefined;
  private readonly region: string;
  private readonly clientConfig: AWSClientBaseConfig;
  private readonly clients = new Map<string, AWSDestroyableClient>();
  private cachedAccountId: Promise<string> | undefined;

  constructor(config: AWSClientProviderConfig) {
    const profile = config.profile?.trim();
    this.profile = profile !== undefined && profile.length > 0 ? profile : undefined;
    this.region = config.region ?? AWS_REGION;
    this.clientConfig =
      this.profile === undefined
        ? { region: this.region }
        : { region: this.region, credentials: fromIni({ profile: this.profile }) };
  }

  /**
   * Returns the cached client created by `factory`, creating it on first request.
   *
   * @param factory - Client factory exported by a service subpath
   * @returns The client bound to this profile and region
   */
  client<TClient extends AWSDestroyableClient>(factory: AWSClientFactory<TClient>): TClient {
    const cached = this.clients.get(factory.key);
    if (cached !== undefined) {
      // Safe: the entry under `factory.key` was created by a factory with the same key.
      return cached as TClient;
    }
    const created = factory.create(this.clientConfig);
    this.clients.set(factory.key, created);
    return created;
  }

  /**
   * Resolves the AWS account id backing this profile via `sts:GetCallerIdentity`.
   *
   * The in-flight promise is cached, so concurrent callers share a single API
   * call and the identity is resolved at most once per cache.
   *
   * @returns The 12-digit AWS account id owning the profile credentials
   * @throws Error when the identity cannot be resolved
   */
  async resolveAccountId(): Promise<string> {
    const pending = (this.cachedAccountId ??= this.requestAccountId());
    try {
      return await pending;
    } catch (error: unknown) {
      // A failed lookup must not be cached: credentials may be refreshed later.
      // Only this attempt is dropped, so a retry started meanwhile survives.
      if (this.cachedAccountId === pending) this.cachedAccountId = undefined;
      throw error;
    }
  }

  private async requestAccountId(): Promise<string> {
    const identity = await this.client(STS_CLIENT).send(new GetCallerIdentityCommand({}));
    const accountId = identity.Account?.trim();
    if (accountId === undefined || accountId === '') {
      throw new Error(`GetCallerIdentity returned no account id for profile '${this.getProfile()}'`);
    }
    return accountId;
  }

  /**
   * @returns The configured profile name (`'default'` for the default credential chain)
   */
  getProfile(): string {
    return this.profile ?? 'default';
  }

  /**
   * @returns The configured AWS region
   */
  getRegion(): string {
    return this.region;
  }

  /**
   * Destroys every client created by this cache and forgets the resolved account id.
   */
  close(): void {
    for (const client of this.clients.values()) {
      client.destroy();
    }
    this.clients.clear();
    this.cachedAccountId = undefined;
  }
}
