/**
 * AWS Credentials Management
 *
 * Simplified AWS module - provides only credentials management for SSO auto-login.
 * AWS clients should be created directly using AWS SDK v3 with the profile string.
 */

// Credentials management
export { GOAWSCredentialsManager } from './GOAWSCredentialsManager.js';
export { GOAWSCredentialsErrorType } from './GOAWSCredentialsError.js';
export type { GOAWSCredentialsErrorAnalysis } from './GOAWSCredentialsError.js';
export type { GOAWSCredentialsManagerOptions } from './GOAWSCredentialsManagerOptions.js';
export type { GOAWSLoginResult } from './GOAWSLoginResult.js';
export type { GOAWSRetryContext, GOAWSRetryOptions } from './GOAWSRetryContext.js';
