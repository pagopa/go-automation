import type { AWSCallerIdentity } from './AWSCallerIdentity.js';
import type { AWSClientFactory } from './AWSClientFactory.js';
import type { AWSDestroyableClient } from './AWSDestroyableClient.js';

/**
 * The AWS clients bound to one profile (or to the default credential chain).
 *
 * Services depend on this contract instead of the aggregate `AWSClientProvider`,
 * so they never load SDK packages of other services.
 */
export interface AWSProfileClients {
  /**
   * Returns the cached client created by `factory` for this profile.
   *
   * @param factory - Client factory exported by a service subpath
   * @returns The client, created on first request and reused afterwards
   */
  client<TClient extends AWSDestroyableClient>(factory: AWSClientFactory<TClient>): TClient;

  /**
   * Resolves the AWS account id backing this profile.
   *
   * @returns The 12-digit AWS account id
   */
  resolveAccountId(): Promise<string>;

  /**
   * Resolves the identity backing this profile: account id and caller ARN.
   *
   * @returns The caller identity
   */
  resolveIdentity(): Promise<AWSCallerIdentity>;

  /**
   * @returns The configured profile name (`'default'` for the default credential chain)
   */
  getProfile(): string;

  /**
   * @returns The configured AWS region
   */
  getRegion(): string;
}
