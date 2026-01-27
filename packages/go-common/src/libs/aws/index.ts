/**
 * AWS Module
 *
 * Provides AWS client management and credentials handling for SSO auto-login.
 */

// Region constant
export { AWS_REGION } from './AWSRegion.js';
export type { AWSRegion } from './AWSRegion.js';

// Client provider
export { AWSClientProvider } from './AWSClientProvider.js';
export type { AWSClientProviderConfig } from './AWSClientProvider.js';

// DynamoDB query service
export { DynamoDBQueryService } from './DynamoDBQueryService.js';
export type { DynamoDBQueryProgressCallback } from './DynamoDBQueryService.js';
export type { DynamoDBQueryOptions } from './models/DynamoDBQueryOptions.js';
export type { DynamoDBQueryResult } from './models/DynamoDBQueryResult.js';

// Credentials management
export { GOAWSCredentialsManager } from './GOAWSCredentialsManager.js';
export { GOAWSCredentialsErrorType } from './GOAWSCredentialsError.js';
export type { GOAWSCredentialsErrorAnalysis } from './GOAWSCredentialsError.js';
export type { GOAWSCredentialsManagerOptions } from './GOAWSCredentialsManagerOptions.js';
export type { GOAWSLoginResult } from './GOAWSLoginResult.js';
export type { GOAWSRetryContext, GOAWSRetryOptions } from './GOAWSRetryContext.js';
