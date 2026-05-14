import type { AthenaClient } from '@aws-sdk/client-athena';
import type { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import type { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { ECSClient } from '@aws-sdk/client-ecs';
import type { S3Client } from '@aws-sdk/client-s3';
import type { SQSClient } from '@aws-sdk/client-sqs';

import type { AWSClientProvider } from './AWSClientProvider.js';
import type { AWSMultiClientProvider } from './AWSMultiClientProvider.js';

type AWSClientsOperationHandler<T> = (profile: string, clientProvider: AWSClientProvider) => Promise<T>;

/**
 * Convenience facade over {@link AWSMultiClientProvider}.
 *
 * Raw AWS SDK clients exposed directly on this class use the first
 * configured profile. Multi-profile access remains available via
 * {@link get}, {@link mapParallel} and {@link mapParallelSettled}.
 */
export class AWSClientsProvider {
  constructor(private readonly multiClientProvider: AWSMultiClientProvider) {}

  /**
   * First configured profile's client provider.
   */
  get first(): AWSClientProvider {
    return this.multiClientProvider.first;
  }

  /**
   * Configured profile names in resolution order.
   */
  get profileNames(): ReadonlyArray<string> {
    return this.multiClientProvider.profileNames;
  }

  /**
   * Number of configured AWS profiles.
   */
  get size(): number {
    return this.multiClientProvider.size;
  }

  /**
   * Whether more than one AWS profile is configured.
   */
  get hasMultipleProfiles(): boolean {
    return this.multiClientProvider.hasMultipleProfiles;
  }

  get s3(): S3Client {
    return this.first.s3;
  }

  get dynamoDB(): DynamoDBClient {
    return this.first.dynamoDB;
  }

  get cloudWatch(): CloudWatchClient {
    return this.first.cloudWatch;
  }

  get cloudWatchLogs(): CloudWatchLogsClient {
    return this.first.cloudWatchLogs;
  }

  get athena(): AthenaClient {
    return this.first.athena;
  }

  get sqs(): SQSClient {
    return this.first.sqs;
  }

  get ecs(): ECSClient {
    return this.first.ecs;
  }

  /**
   * Returns the client provider for a specific configured profile.
   */
  get(profile: string): AWSClientProvider {
    return this.multiClientProvider.getClientProvider(profile);
  }

  /**
   * Alias for callers that prefer the underlying provider terminology.
   */
  getClientProvider(profile: string): AWSClientProvider {
    return this.get(profile);
  }

  /**
   * Execute an operation across all configured profiles in parallel.
   */
  async mapParallel<T>(operation: AWSClientsOperationHandler<T>): Promise<Map<string, T>> {
    return this.multiClientProvider.mapParallel(operation);
  }

  /**
   * Execute an operation across all configured profiles in parallel,
   * collecting per-profile errors instead of throwing on first failure.
   */
  async mapParallelSettled<T>(operation: AWSClientsOperationHandler<T>): Promise<{
    readonly results: Map<string, T>;
    readonly errors: Map<string, Error>;
  }> {
    return this.multiClientProvider.mapParallelSettled(operation);
  }
}
