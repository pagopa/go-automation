/**
 * AWSClientProvider - aggregate facade over the AWS clients of one profile.
 *
 * Exposes one getter per commonly used service, backed by {@link AWSProfileClientCache}:
 * clients are created lazily on first access and reused thereafter. Being an aggregate,
 * this module imports every service client factory: it belongs to `@pagopa/go-aws/all`,
 * the composition root. Code that needs a single service should depend on
 * {@link AWSProfileClients} and that service's factory instead.
 *
 * EC2 is intentionally not exposed as a getter (it would force every `./all` consumer to
 * load `@aws-sdk/client-ec2`): use `client(EC2_CLIENT)` from `@pagopa/go-aws/ec2`.
 */

import type { AthenaClient } from '@aws-sdk/client-athena';
import type { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import type { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { ECSClient } from '@aws-sdk/client-ecs';
import type { LambdaClient } from '@aws-sdk/client-lambda';
import type { S3Client } from '@aws-sdk/client-s3';
import type { SchedulerClient } from '@aws-sdk/client-scheduler';
import type { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { SQSClient } from '@aws-sdk/client-sqs';
import type { SSMClient } from '@aws-sdk/client-ssm';
import type { STSClient } from '@aws-sdk/client-sts';

import { ATHENA_CLIENT } from '../athena/ATHENA_CLIENT.js';
import type { AWSClientFactory } from '../AWSClientFactory.js';
import type { AWSCallerIdentity } from '../AWSCallerIdentity.js';
import type { AWSClientProviderConfig } from '../AWSClientProviderConfig.js';
import type { AWSDestroyableClient } from '../AWSDestroyableClient.js';
import type { AWSProfileClients } from '../AWSProfileClients.js';
import { AWSProfileClientCache } from '../AWSProfileClientCache.js';
import { CLOUDWATCH_LOGS_CLIENT } from '../cloudwatch-logs/CLOUDWATCH_LOGS_CLIENT.js';
import { CLOUDWATCH_CLIENT } from '../cloudwatch-metrics/CLOUDWATCH_CLIENT.js';
import { DYNAMODB_CLIENT } from '../dynamodb/DYNAMODB_CLIENT.js';
import { ECS_CLIENT } from '../ecs/ECS_CLIENT.js';
import { LAMBDA_CLIENT } from '../lambda/LAMBDA_CLIENT.js';
import { S3_CLIENT } from '../s3/S3_CLIENT.js';
import { SCHEDULER_CLIENT } from '../scheduler/SCHEDULER_CLIENT.js';
import { SECRETS_MANAGER_CLIENT } from '../secrets-manager/SECRETS_MANAGER_CLIENT.js';
import { SQS_CLIENT } from '../sqs/SQS_CLIENT.js';
import { SSM_CLIENT } from '../ssm/SSM_CLIENT.js';
import { STS_CLIENT } from '../STS_CLIENT.js';

/**
 * Provides cached AWS SDK client instances for one profile, with one getter per service.
 */
export class AWSClientProvider implements AWSProfileClients {
  private readonly cache: AWSProfileClientCache;

  constructor(config: AWSClientProviderConfig) {
    this.cache = new AWSProfileClientCache(config);
  }

  /**
   * Returns the cached client created by `factory` (e.g. `EC2_CLIENT`).
   *
   * @param factory - Client factory exported by a service subpath
   * @returns The client bound to this profile and region
   */
  client<TClient extends AWSDestroyableClient>(factory: AWSClientFactory<TClient>): TClient {
    return this.cache.client(factory);
  }

  /** Returns the cached S3Client instance. */
  get s3(): S3Client {
    return this.cache.client(S3_CLIENT);
  }

  /** Returns the cached DynamoDBClient instance. */
  get dynamoDB(): DynamoDBClient {
    return this.cache.client(DYNAMODB_CLIENT);
  }

  /** Returns the cached CloudWatchClient instance. */
  get cloudWatch(): CloudWatchClient {
    return this.cache.client(CLOUDWATCH_CLIENT);
  }

  /** Returns the cached CloudWatchLogsClient instance. */
  get cloudWatchLogs(): CloudWatchLogsClient {
    return this.cache.client(CLOUDWATCH_LOGS_CLIENT);
  }

  /** Returns the cached AthenaClient instance. */
  get athena(): AthenaClient {
    return this.cache.client(ATHENA_CLIENT);
  }

  /** Returns the cached SQSClient instance. */
  get sqs(): SQSClient {
    return this.cache.client(SQS_CLIENT);
  }

  /** Returns the cached ECSClient instance. */
  get ecs(): ECSClient {
    return this.cache.client(ECS_CLIENT);
  }

  /** Returns the cached LambdaClient instance. */
  get lambda(): LambdaClient {
    return this.cache.client(LAMBDA_CLIENT);
  }

  /** Returns the cached SecretsManagerClient instance. */
  get secretsManager(): SecretsManagerClient {
    return this.cache.client(SECRETS_MANAGER_CLIENT);
  }

  /** Returns the cached SchedulerClient instance. */
  get scheduler(): SchedulerClient {
    return this.cache.client(SCHEDULER_CLIENT);
  }

  /** Returns the cached SSMClient instance. */
  get ssm(): SSMClient {
    return this.cache.client(SSM_CLIENT);
  }

  /** Returns the cached STSClient instance. */
  get sts(): STSClient {
    return this.cache.client(STS_CLIENT);
  }

  /**
   * Resolves the AWS account id backing this profile via `sts:GetCallerIdentity`.
   *
   * @returns The 12-digit AWS account id owning the profile credentials
   * @throws Error when the identity cannot be resolved
   */
  async resolveAccountId(): Promise<string> {
    return this.cache.resolveAccountId();
  }

  /**
   * Resolves the identity backing this profile (account id and caller ARN) via `sts:GetCallerIdentity`.
   *
   * @returns The caller identity of the profile credentials
   * @throws Error when the identity cannot be resolved
   */
  async resolveIdentity(): Promise<AWSCallerIdentity> {
    return this.cache.resolveIdentity();
  }

  /**
   * Returns the configured AWS profile name
   */
  getProfile(): string {
    return this.cache.getProfile();
  }

  /**
   * Returns the configured AWS region
   */
  getRegion(): string {
    return this.cache.getRegion();
  }

  /**
   * Closes all cached clients and releases resources.
   */
  close(): void {
    this.cache.close();
  }
}
