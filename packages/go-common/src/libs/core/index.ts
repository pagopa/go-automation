/**
 * GO Core Libraries
 * Core utilities and services for GO automation scripts
 */

// Export error handling utilities
export * from './errors/index.js';

// Export events
export * from './events/index.js';

// Export importers
export * from './importers/index.js';

// Export exporters
export * from './exporters/index.js';

// Export configuration system
export * from './config/index.js';

// Export file operations
export * from './files/index.js';

// Export JSON utilities
export * from './json/index.js';

// Export utilities
export * from './network/index.js';
export * from './utils/index.js';

// Export logging system
export * from './logging/index.js';

// Export prompt system
export * from './prompt/index.js';

// Export environment detection
export * from './environment/index.js';

// Export script framework
export * from './script/index.js';

// Export messaging
export * from './messaging/index.js';

// Export AWS utilities (DynamoDB and SQS query services)
export { DynamoDBQueryService } from '../aws/DynamoDBQueryService.js';
export type { DynamoDBQueryProgressCallback } from '../aws/DynamoDBQueryService.js';
export { AWSSQSService } from '../aws/AWSSQSService.js';
export type { SQSQueueMetadata } from '../aws/models/SQSQueueMetadata.js';
export { SQSReceiveDeduplicationMode } from '../aws/models/SQSReceiveDeduplicationMode.js';
export type { SQSReceiveResult } from '../aws/models/SQSReceiveResult.js';
export type { DLQStats } from '../aws/models/DLQStats.js';
export type { DynamoDBQueryOptions } from '../aws/models/DynamoDBQueryOptions.js';
export type { DynamoDBQueryResult } from '../aws/models/DynamoDBQueryResult.js';

// Re-export essential AWS SDK types
export type { Message, SendMessageBatchRequestEntry, SendMessageBatchCommandOutput } from '@aws-sdk/client-sqs';
