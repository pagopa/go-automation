/**
 * AWSClientProvider - Provides cached AWS SDK client instances
 *
 * Creates and caches AWS SDK clients for optimal performance.
 * Each client type is lazily initialized on first access and reused thereafter.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { fromIni } from '@aws-sdk/credential-provider-ini';

import { AWS_REGION } from './AWSRegion.js';

/**
 * Configuration options for AWSClientProvider
 */
export interface AWSClientProviderConfig {
  /** AWS SSO profile name */
  readonly profile: string;

  /** AWS region (defaults to eu-south-1) */
  readonly region?: string;
}

/**
 * Provides cached AWS SDK client instances.
 *
 * Clients are created lazily on first access and cached for subsequent calls.
 * This ensures optimal performance by reusing connections and avoiding
 * repeated credential resolution.
 *
 * @example
 * ```typescript
 * const provider = new AWSClientProvider({ profile: 'sso_pn-core-prod' });
 *
 * // First access creates the client
 * const client1 = provider.dynamoDB;
 *
 * // Subsequent accesses return the same instance
 * const client2 = provider.dynamoDB;
 * console.log(client1 === client2); // true
 *
 * // Cleanup when done
 * provider.close();
 * ```
 */
export class AWSClientProvider {
  private readonly profile: string;
  private readonly region: string;
  private readonly clientConfig: DynamoDBClientConfig;

  // Cached client instances (lazy initialization)
  private cachedDynamoDBClient: DynamoDBClient | null = null;

  constructor(config: AWSClientProviderConfig) {
    this.profile = config.profile;
    this.region = config.region ?? AWS_REGION;
    this.clientConfig = {
      region: this.region,
      credentials: fromIni({ profile: this.profile }),
    };
  }

  /**
   * Returns the cached DynamoDBClient instance.
   * Creates the client on first access.
   */
  get dynamoDB(): DynamoDBClient {
    if (this.cachedDynamoDBClient === null) {
      this.cachedDynamoDBClient = new DynamoDBClient(this.clientConfig);
    }
    return this.cachedDynamoDBClient;
  }

  /**
   * Returns the configured AWS profile name
   */
  getProfile(): string {
    return this.profile;
  }

  /**
   * Returns the configured AWS region
   */
  getRegion(): string {
    return this.region;
  }

  /**
   * Closes all cached clients and releases resources.
   * After calling this method, the provider should not be used.
   */
  close(): void {
    if (this.cachedDynamoDBClient !== null) {
      this.cachedDynamoDBClient.destroy();
      this.cachedDynamoDBClient = null;
    }
  }
}
