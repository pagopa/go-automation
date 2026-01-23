/**
 * Context information for retry operations
 */
export interface GOAWSRetryContext {
  /** Current attempt number (1-based) */
  readonly attempt: number;
  /** Maximum attempts allowed */
  readonly maxAttempts: number;
  /** Whether a login was performed before this attempt */
  readonly loginPerformed: boolean;
  /** The profile being used */
  readonly profile: string;
}

/**
 * Options for the withCredentialRetry wrapper
 */
export interface GOAWSRetryOptions {
  /**
   * AWS profile name to use for SSO login
   */
  readonly profile: string;

  /**
   * Override max retries for this specific operation
   */
  readonly maxRetries?: number | undefined;

  /**
   * Called before each retry attempt
   */
  readonly onRetry?: ((context: GOAWSRetryContext) => void) | undefined;

  /**
   * Called when operation succeeds
   */
  readonly onSuccess?: ((context: GOAWSRetryContext) => void) | undefined;
}
