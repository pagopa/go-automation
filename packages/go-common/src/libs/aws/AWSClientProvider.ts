/**
 * AWSClientProvider - Provides cached AWS SDK client instances
 *
 * Creates and caches AWS SDK clients for optimal performance.
 * Each client type is lazily initialized on first access and reused thereafter.
 */

import { S3Client } from '@aws-sdk/client-s3';
import type { S3ClientConfig } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import type { CloudWatchClientConfig } from '@aws-sdk/client-cloudwatch';
import { SQSClient } from '@aws-sdk/client-sqs';
import type { SQSClientConfig } from '@aws-sdk/client-sqs';
import { ECSClient } from '@aws-sdk/client-ecs';
import type { ECSClientConfig } from '@aws-sdk/client-ecs';
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
  private readonly dynamoDBClientConfig: DynamoDBClientConfig;
  private readonly cloudWatchClientConfig: CloudWatchClientConfig;
  private readonly sqsClientConfig: SQSClientConfig;
  private readonly secClientConfig: S3ClientConfig;
  private readonly ecsClientConfig: ECSClientConfig;

  // Cached client instances (lazy initialization)
  private cachedDynamoDBClient: DynamoDBClient | null = null;
  private cachedCloudWatchClient: CloudWatchClient | null = null;
  private cachedSQSClient: SQSClient | null = null;
  private cachedS3Client: S3Client | null = null;
  private cachedECSClient: ECSClient | null = null;

  constructor(config: AWSClientProviderConfig) {
    this.profile = config.profile;
    this.region = config.region ?? AWS_REGION;
    this.dynamoDBClientConfig = {
      region: this.region,
      credentials: fromIni({ profile: this.profile }),
    };
    this.cloudWatchClientConfig = {
      region: this.region,
      credentials: fromIni({ profile: this.profile }),
    };
    this.sqsClientConfig = {
      region: this.region,
      credentials: fromIni({ profile: this.profile }),
    };
    this.secClientConfig = {
      region: this.region,
      credentials: fromIni({ profile: this.profile }),
    };
    this.ecsClientConfig = {
      region: this.region,
      credentials: fromIni({ profile: this.profile }),
    };
  }

  /**
   * Returns the cached S3Client instance.
   * Creates the client on first access.
   */
  get s3(): S3Client {
    this.cachedS3Client ??= new S3Client(this.secClientConfig);
    return this.cachedS3Client;
  }

  /**
   * Returns the cached DynamoDBClient instance.
   * Creates the client on first access.
   */
  get dynamoDB(): DynamoDBClient {
    this.cachedDynamoDBClient ??= new DynamoDBClient(this.dynamoDBClientConfig);
    return this.cachedDynamoDBClient;
  }

  /**
   * Returns the cached CloudWatchClient instance.
   * Creates the client on first access.
   */
  get cloudWatch(): CloudWatchClient {
    this.cachedCloudWatchClient ??= new CloudWatchClient(this.cloudWatchClientConfig);
    return this.cachedCloudWatchClient;
  }

  /**
   * Returns the cached SQSClient instance.
   * Creates the client on first access.
   */
  get sqs(): SQSClient {
    this.cachedSQSClient ??= new SQSClient(this.sqsClientConfig);
    return this.cachedSQSClient;
  }

  /**
   * Returns the cached ECSClient instance.
   * Creates the client on first access.
   */
  get ecs(): ECSClient {
    this.cachedECSClient ??= new ECSClient(this.ecsClientConfig);
    return this.cachedECSClient;
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

    if (this.cachedCloudWatchClient !== null) {
      this.cachedCloudWatchClient.destroy();
      this.cachedCloudWatchClient = null;
    }

    if (this.cachedSQSClient !== null) {
      this.cachedSQSClient.destroy();
      this.cachedSQSClient = null;
    }

    if (this.cachedECSClient !== null) {
      this.cachedECSClient.destroy();
      this.cachedECSClient = null;
    }

    if (this.cachedS3Client !== null) {
      this.cachedS3Client.destroy();
      this.cachedS3Client = null;
    }
  }
}
