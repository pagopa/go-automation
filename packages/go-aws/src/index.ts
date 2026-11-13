/**
 * @pagopa/go-aws — core.
 *
 * Credentials and profiles, the per-profile lazy client cache and the contracts
 * shared by every service subpath. Imports only `@aws-sdk/client-sts` and
 * `@aws-sdk/credential-provider-ini`: service SDKs are loaded by their subpaths.
 */

// Region
export { AWS_REGION } from './AWSRegion.js';
export type { AWSRegion } from './AWSRegion.js';

// Clients of one profile
export type { AWSClientProviderConfig } from './AWSClientProviderConfig.js';
export type { AWSClientBaseConfig } from './AWSClientBaseConfig.js';
export type { AWSClientFactory } from './AWSClientFactory.js';
export type { AWSDestroyableClient } from './AWSDestroyableClient.js';
export type { AWSProfileClients } from './AWSProfileClients.js';
export { AWSProfileClientCache } from './AWSProfileClientCache.js';
export { STS_CLIENT } from './STS_CLIENT.js';

// Profile sets and execution targets
export { AWSAccountProfileSet } from './AWSAccountProfileSet.js';
export type { AWSProfileSet } from './AWSProfileSet.js';
export type { AWSExecutionTarget } from './AWSExecutionTarget.js';
export { AWSTargetNotConfiguredError, isAWSTargetNotConfiguredError } from './AWSTargetNotConfiguredError.js';
export { parseAwsProfileEntries } from './profiles/index.js';
export type { AWSProfileEntries } from './profiles/index.js';
export type { AWSCallerIdentity } from './AWSCallerIdentity.js';

// Remote operations tracking (cancellation cleanup)
export { AWSActiveOperationRegistry } from './AWSActiveOperationRegistry.js';
export type {
  AWSRegisteredOperation,
  AWSRemoteCleanupWarning,
  AWSRemoteOperation,
  AWSRemoteOperationService,
} from './AWSActiveOperationRegistry.js';

// Credentials management (SSO auto-login)
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
