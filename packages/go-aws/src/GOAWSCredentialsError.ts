/**
 * AWS Credentials Error Types
 * Represents different types of credential-related errors
 */

/**
 * Enum for AWS credential error types
 */
export enum GOAWSCredentialsErrorType {
  /** SSO session has expired and needs refresh */
  SSO_SESSION_EXPIRED = 'SSO_SESSION_EXPIRED',
  /** SSO session token is invalid (corrupted, revoked, or malformed) */
  SSO_SESSION_INVALID = 'SSO_SESSION_INVALID',
  /** Credentials provider failed for unknown reason */
  CREDENTIALS_PROVIDER_FAILED = 'CREDENTIALS_PROVIDER_FAILED',
  /** AWS profile not found */
  PROFILE_NOT_FOUND = 'PROFILE_NOT_FOUND',
  /** Unknown credential error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Result of credential error analysis
 */
export interface GOAWSCredentialsErrorAnalysis {
  /** The detected error type */
  readonly type: GOAWSCredentialsErrorType;
  /** Whether the error is recoverable via SSO login */
  readonly isRecoverable: boolean;
  /** The original error message */
  readonly originalMessage: string;
  /** Extracted profile name, if available */
  readonly profileName?: string | undefined;
}
