/**
 * AWS Module
 *
 * Provides AWS client management and credentials handling for SSO auto-login.
 */

// Region constant
export { AWS_REGION } from './AWSRegion.js';
export type { AWSRegion } from './AWSRegion.js';

// Client provider (single profile)
export { AWSClientProvider } from './AWSClientProvider.js';
export type { AWSClientProviderConfig } from './AWSClientProvider.js';

// Multi-client provider (multiple profiles)
export { AWSMultiClientProvider } from './AWSMultiClientProvider.js';
export type { AWSMultiClientProviderConfig } from './AWSMultiClientProvider.js';

// S3 service
export { AWSS3Service } from './AWSS3Service.js';
export type { AWSS3ObjectEntry, AWSS3BucketEntry } from './AWSS3Service.js';

// SQS service
export { AWSSQSService } from './AWSSQSService.js';
export { SQSUtils, SQS_MAX_BATCH_SIZE, SQS_MAX_PAYLOAD_BYTES } from './SQSUtils.js';
export type { DLQStats } from './models/DLQStats.js';
export { SQSProcessAction } from './models/SQSProcessAction.js';
export { SQSReceiveDeduplicationMode } from './models/SQSReceiveDeduplicationMode.js';
export type { SQSQueueMetadata } from './models/SQSQueueMetadata.js';
export type { SQSBatchSendRetryOptions } from './models/SQSBatchSendRetryOptions.js';
export type { SQSReceiveOptions } from './models/SQSReceiveOptions.js';
export type { SQSReceiveResult } from './models/SQSReceiveResult.js';
export type { SQSReceiveCallbacks } from './models/SQSReceiveCallbacks.js';
export type { SQSProcessOptions } from './models/SQSProcessOptions.js';
export type { SQSProcessResult } from './models/SQSProcessResult.js';
export type { SQSProcessCallbacks } from './models/SQSProcessCallbacks.js';
export type { SQSMoveOptions } from './models/SQSMoveOptions.js';
export type { SQSMoveResult } from './models/SQSMoveResult.js';
export type { SQSMoveError } from './models/SQSMoveError.js';
export type { SQSMoveCallbacks } from './models/SQSMoveCallbacks.js';
export type {
  SQSBatchRetryHandler,
  SQSReceiveProgressHandler,
  SQSReceiveEmptyReceiveHandler,
  SQSProcessProgressHandler,
  SQSMessageHandler,
  SQSMoveProgressHandler,
  SQSMoveErrorHandler,
  SQSMoveErrorStage,
} from './models/SQSHandlers.js';

// DynamoDB query service
export { DynamoDBQueryService } from './DynamoDBQueryService.js';
export type { DynamoDBQueryProgressHandler } from './DynamoDBQueryService.js';
export type { DynamoDBQueryOptions, DynamoDBKeyType } from './models/DynamoDBQueryOptions.js';
export type { DynamoDBQueryResult } from './models/DynamoDBQueryResult.js';

// ECS service
export { AWSECSService } from './AWSECSService.js';
export type { ECSClusterHealthReport, ECSServiceHealth, ECSTaskHealth } from './models/ECSClusterHealth.js';

// Credentials management
export { GOAWSCredentialsManager } from './GOAWSCredentialsManager.js';
export { GOAWSCredentialsErrorType } from './GOAWSCredentialsError.js';
export type { GOAWSCredentialsErrorAnalysis } from './GOAWSCredentialsError.js';
export type {
  GOAWSCredentialsManagerOptions,
  GOAWSCredentialsLogHandler,
  GOAWSCredentialsPromptHandler,
} from './GOAWSCredentialsManagerOptions.js';
export type { GOAWSLoginResult } from './GOAWSLoginResult.js';
export type { GOAWSRetryContext, GOAWSRetryOptions, GOAWSRetryHandler } from './GOAWSRetryContext.js';

// Multi-profile validation results
export type { AWSMultiProfileValidationResult } from './AWSMultiProfileValidationResult.js';
export type {
  AWSProfileValidationResult,
  AWSProfileValidationSuccess,
  AWSProfileValidationFailure,
} from './AWSProfileValidationResult.js';
export { isProfileValidationSuccess, isProfileValidationFailure } from './AWSProfileValidationResult.js';

// Re-export essential AWS SDK types
export type { Message, SendMessageBatchRequestEntry, SendMessageBatchCommandOutput } from '@aws-sdk/client-sqs';
export type { SQSClient } from '@aws-sdk/client-sqs';
export type { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
export type { ECSClient } from '@aws-sdk/client-ecs';

// DynamoDB types
export type {
  TableDescription,
  TableStatus,
  AttributeValue,
  QueryCommandInput,
  QueryCommandOutput,
} from '@aws-sdk/client-dynamodb';
export type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
