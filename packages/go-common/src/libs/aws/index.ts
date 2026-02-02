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

// Multi-profile validation results
export type { AWSMultiProfileValidationResult } from './AWSMultiProfileValidationResult.js';
export type {
  AWSProfileValidationResult,
  AWSProfileValidationSuccess,
  AWSProfileValidationFailure,
} from './AWSProfileValidationResult.js';
export {
  isProfileValidationSuccess,
  isProfileValidationFailure,
} from './AWSProfileValidationResult.js';
