/**
 * AWSClientProvider - Provides cached AWS SDK client instances
 *
 * Creates and caches AWS SDK clients for optimal performance.
 * Each client type is lazily initialized on first access and reused thereafter.
 */

import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { AthenaClient } from '@aws-sdk/client-athena';
import { SQSClient } from '@aws-sdk/client-sqs';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { ECSClient } from '@aws-sdk/client-ecs';
import { fromIni } from '@aws-sdk/credential-provider-ini';

import { AWS_REGION } from './AWSRegion.js';

/**
 * Configuration options for AWSClientProvider
 */
export interface AWSClientProviderConfig {
  /** AWS SSO profile name. When omitted, the SDK default credential chain is used. */
  readonly profile?: string;

  /** AWS region (defaults to eu-south-1) */
  readonly region?: string;
}

/**
 * Provides cached AWS SDK client instances.
 *
 * Clients are created lazily on first access and cached for subsequent calls.
 * This ensures optimal performance by reusing connections and avoiding
 * repeated credential resolution.
 */
export class AWSClientProvider {
  private readonly profile: string | undefined;
  private readonly region: string;
  private readonly clientConfig: {
    region: string;
    credentials?: ReturnType<typeof fromIni>;
  };

  // Cached client instances (lazy initialization)
  private cachedDynamoDBClient: DynamoDBClient | null = null;
  private cachedCloudWatchClient: CloudWatchClient | null = null;
  private cachedCloudWatchLogsClient: CloudWatchLogsClient | null = null;
  private cachedAthenaClient: AthenaClient | null = null;
  private cachedSQSClient: SQSClient | null = null;
  private cachedS3Client: S3Client | null = null;
  private cachedECSClient: ECSClient | null = null;
  private cachedSecretsManagerClient: SecretsManagerClient | null = null;

  constructor(config: AWSClientProviderConfig) {
    const profile = config.profile?.trim();
    this.profile = profile && profile.length > 0 ? profile : undefined;
    this.region = config.region ?? AWS_REGION;
    this.clientConfig =
      this.profile === undefined
        ? { region: this.region }
        : {
            region: this.region,
            credentials: fromIni({ profile: this.profile }),
          };
  }

  /**
   * Returns the cached S3Client instance.
   */
  get s3(): S3Client {
    this.cachedS3Client ??= new S3Client(this.clientConfig);
    return this.cachedS3Client;
  }

  /**
   * Returns the cached DynamoDBClient instance.
   */
  get dynamoDB(): DynamoDBClient {
    this.cachedDynamoDBClient ??= new DynamoDBClient(this.clientConfig);
    return this.cachedDynamoDBClient;
  }

  /**
   * Returns the cached CloudWatchClient instance.
   */
  get cloudWatch(): CloudWatchClient {
    this.cachedCloudWatchClient ??= new CloudWatchClient(this.clientConfig);
    return this.cachedCloudWatchClient;
  }

  /**
   * Returns the cached CloudWatchLogsClient instance.
   */
  get cloudWatchLogs(): CloudWatchLogsClient {
    this.cachedCloudWatchLogsClient ??= new CloudWatchLogsClient(this.clientConfig);
    return this.cachedCloudWatchLogsClient;
  }

  /**
   * Returns the cached AthenaClient instance.
   */
  get athena(): AthenaClient {
    this.cachedAthenaClient ??= new AthenaClient(this.clientConfig);
    return this.cachedAthenaClient;
  }

  /**
   * Returns the cached SQSClient instance.
   */
  get sqs(): SQSClient {
    this.cachedSQSClient ??= new SQSClient(this.clientConfig);
    return this.cachedSQSClient;
  }

  /**
   * Returns the cached ECSClient instance.
   */
  get ecs(): ECSClient {
    this.cachedECSClient ??= new ECSClient(this.clientConfig);
    return this.cachedECSClient;
  }

  get secretsManager(): SecretsManagerClient {
    this.cachedSecretsManagerClient ??= new SecretsManagerClient(this.clientConfig);
    return this.cachedSecretsManagerClient;
  }

  /**
   * Returns the configured AWS profile name
   */
  getProfile(): string {
    return this.profile ?? 'default';
  }

  /**
   * Returns the configured AWS region
   */
  getRegion(): string {
    return this.region;
  }

  /**
   * Closes all cached clients and releases resources.
   */
  close(): void {
    this.cachedDynamoDBClient?.destroy();
    this.cachedCloudWatchClient?.destroy();
    this.cachedCloudWatchLogsClient?.destroy();
    this.cachedAthenaClient?.destroy();
    this.cachedSQSClient?.destroy();
    this.cachedECSClient?.destroy();
    this.cachedS3Client?.destroy();
    this.cachedSecretsManagerClient?.destroy();

    this.cachedDynamoDBClient = null;
    this.cachedCloudWatchClient = null;
    this.cachedCloudWatchLogsClient = null;
    this.cachedAthenaClient = null;
    this.cachedSQSClient = null;
    this.cachedECSClient = null;
    this.cachedS3Client = null;
    this.cachedSecretsManagerClient = null;
  }
}
