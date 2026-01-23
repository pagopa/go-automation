/**
 * GOAWSCredentialsManager
 * Manages AWS SSO credential lifecycle with automatic login on expiration
 */

import { spawn, spawnSync } from 'node:child_process';

import { fromIni } from '@aws-sdk/credential-provider-ini';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';

import type { GOAWSCredentialsErrorAnalysis } from './GOAWSCredentialsError.js';
import { GOAWSCredentialsErrorType } from './GOAWSCredentialsError.js';
import type { GOAWSCredentialsManagerOptions } from './GOAWSCredentialsManagerOptions.js';
import type { GOAWSLoginResult } from './GOAWSLoginResult.js';
import type { GOAWSRetryContext, GOAWSRetryOptions } from './GOAWSRetryContext.js';

/**
 * Internal options type with all required fields (no undefined)
 */
interface InternalOptions {
  readonly autoLogin: boolean;
  readonly interactive: boolean;
  readonly maxRetries: number;
  readonly loginTimeout: number;
}

/**
 * Default options for the credentials manager
 */
const DEFAULT_OPTIONS: InternalOptions = {
  autoLogin: true,
  interactive: true,
  maxRetries: 1,
  loginTimeout: 120000,
};

/**
 * Error patterns for SSO session expiration detection
 * Compiled once for performance (O(1) initialization, O(N) pattern matching)
 */
const SSO_ERROR_PATTERNS: ReadonlyArray<RegExp> = [
  /The SSO session associated with this profile is invalid/i,
  /The SSO session associated with this profile has expired/i,
  /Token has expired and refresh failed/i,
  /Error loading SSO Token/i,
  /SSOTokenProviderFailure/i,
  /Unable to load SSO token/i,
  /ExpiredToken/i,
  /ExpiredTokenException/i,
];

const PROFILE_NOT_FOUND_PATTERNS: ReadonlyArray<RegExp> = [
  /Profile .+ could not be found/i,
  /The config profile \(.+\) could not be found/i,
];

/**
 * Manager for AWS SSO credentials with automatic login on expiration
 *
 * @example
 * ```typescript
 * const manager = new GOAWSCredentialsManager({
 *   interactive: true,
 *   onLog: (msg, level) => console.log(`[${level}] ${msg}`),
 *   onPrompt: async (msg) => {
 *     const response = await prompt(msg);
 *     return response === 'y';
 *   },
 * });
 *
 * // Wrap AWS operations with automatic retry
 * const result = await manager.withCredentialRetry(
 *   async () => {
 *     const client = new S3Client(sdkConfig);
 *     return client.send(new ListBucketsCommand({}));
 *   },
 *   { profile: 'pn-core-hotfix_FullAdmin' }
 * );
 * ```
 */
export class GOAWSCredentialsManager {
  private readonly options: InternalOptions;
  private readonly onLog?: GOAWSCredentialsManagerOptions['onLog'];
  private readonly onPrompt?: GOAWSCredentialsManagerOptions['onPrompt'];

  constructor(options: GOAWSCredentialsManagerOptions = {}) {
    this.options = {
      autoLogin: options.autoLogin ?? DEFAULT_OPTIONS.autoLogin,
      interactive: options.interactive ?? DEFAULT_OPTIONS.interactive,
      maxRetries: options.maxRetries ?? DEFAULT_OPTIONS.maxRetries,
      loginTimeout: options.loginTimeout ?? DEFAULT_OPTIONS.loginTimeout,
    };
    this.onLog = options.onLog;
    this.onPrompt = options.onPrompt;
  }

  /**
   * Analyze an error to determine if it's a credential-related issue
   *
   * @param error - The error to analyze
   * @returns Analysis result with error type and recovery information
   */
  public analyzeError(error: unknown): GOAWSCredentialsErrorAnalysis {
    const message = this.extractErrorMessage(error);

    // Check for SSO session errors (recoverable)
    for (const pattern of SSO_ERROR_PATTERNS) {
      if (pattern.test(message)) {
        return {
          type: GOAWSCredentialsErrorType.SSO_SESSION_EXPIRED,
          isRecoverable: true,
          originalMessage: message,
          profileName: this.extractProfileFromError(message),
        };
      }
    }

    // Check for profile not found (not recoverable via login)
    for (const pattern of PROFILE_NOT_FOUND_PATTERNS) {
      if (pattern.test(message)) {
        return {
          type: GOAWSCredentialsErrorType.PROFILE_NOT_FOUND,
          isRecoverable: false,
          originalMessage: message,
          profileName: this.extractProfileFromError(message),
        };
      }
    }

    // Check for CredentialsProviderError (may be recoverable)
    if (this.isCredentialsProviderError(error)) {
      return {
        type: GOAWSCredentialsErrorType.CREDENTIALS_PROVIDER_FAILED,
        isRecoverable: true, // Attempt login as it might help
        originalMessage: message,
        profileName: this.extractProfileFromError(message),
      };
    }

    return {
      type: GOAWSCredentialsErrorType.UNKNOWN,
      isRecoverable: false,
      originalMessage: message,
    };
  }

  /**
   * Check if an error is due to SSO session expiration
   *
   * @param error - The error to check
   * @returns True if the error is due to expired SSO session
   */
  public isSSSOSessionExpired(error: unknown): boolean {
    const analysis = this.analyzeError(error);
    return analysis.type === GOAWSCredentialsErrorType.SSO_SESSION_EXPIRED ||
      (analysis.type === GOAWSCredentialsErrorType.CREDENTIALS_PROVIDER_FAILED && analysis.isRecoverable);
  }

  /**
   * Execute AWS SSO login for a profile
   *
   * @param profile - The AWS profile name to login
   * @returns Login result with success status and details
   */
  public async executeAWSSSOLogin(profile: string): Promise<GOAWSLoginResult> {
    const startTime = Date.now();

    this.log(`Starting AWS SSO login for profile: ${profile}`, 'info');

    return new Promise<GOAWSLoginResult>((resolve) => {
      const child = spawn('aws', ['sso', 'login', `--profile=${profile}`], {
        stdio: 'inherit', // Interactive: allows browser to open
        shell: false,
      });

      // Handle timeout
      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          success: false,
          profile,
          duration: Date.now() - startTime,
          errorMessage: `Login timed out after ${this.options.loginTimeout}ms`,
          exitCode: -1,
        });
      }, this.options.loginTimeout);

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        if (code === 0) {
          this.log(`AWS SSO login successful for profile: ${profile} (${duration}ms)`, 'info');
          resolve({
            success: true,
            profile,
            duration,
            exitCode: code,
          });
        } else {
          this.log(`AWS SSO login failed for profile: ${profile} (exit code: ${code})`, 'error');
          resolve({
            success: false,
            profile,
            duration,
            errorMessage: `AWS CLI exited with code ${code}`,
            exitCode: code ?? undefined,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeoutId);
        this.log(`AWS SSO login error: ${err.message}`, 'error');
        resolve({
          success: false,
          profile,
          duration: Date.now() - startTime,
          errorMessage: err.message,
        });
      });
    });
  }

  /**
   * Wrap an AWS operation with automatic credential retry on expiration
   *
   * This is the primary API for handling credential expiration gracefully.
   * When an SSO session expires during the operation, it will:
   * 1. Detect the credential error
   * 2. Prompt the user (if interactive mode)
   * 3. Execute AWS SSO login
   * 4. Retry the original operation
   *
   * @param operation - The async function to execute
   * @param options - Retry options including profile name
   * @returns The result of the operation
   * @throws The original error if not recoverable or retry fails
   */
  public async withCredentialRetry<T>(operation: () => Promise<T>, options: GOAWSRetryOptions): Promise<T> {
    const maxRetries = options.maxRetries ?? this.options.maxRetries;
    const maxAttempts = maxRetries + 1;
    let lastError: unknown;
    let loginPerformed = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const context: GOAWSRetryContext = {
        attempt,
        maxAttempts,
        loginPerformed,
        profile: options.profile,
      };

      try {
        const result = await operation();
        options.onSuccess?.(context);
        return result;
      } catch (error) {
        lastError = error;

        // Check if this is a recoverable credential error
        const analysis = this.analyzeError(error);

        if (!analysis.isRecoverable) {
          // Not a credential error, re-throw immediately
          throw error;
        }

        // Don't retry if we've exhausted attempts
        if (attempt >= maxAttempts) {
          this.log(`Max retry attempts (${maxAttempts}) exhausted`, 'warn');
          throw error;
        }

        // Don't auto-login if disabled
        if (!this.options.autoLogin) {
          this.log('Auto-login is disabled, not attempting SSO login', 'warn');
          throw error;
        }

        // Prompt user in interactive mode
        if (this.options.interactive && this.onPrompt) {
          const confirmed = await this.onPrompt(
            `AWS SSO session expired. Login to AWS (aws sso login --profile=${options.profile})?`
          );
          if (!confirmed) {
            this.log('User declined SSO login', 'info');
            throw error;
          }
        }

        // Execute SSO login
        const loginResult = await this.executeAWSSSOLogin(options.profile);
        loginPerformed = true;

        if (!loginResult.success) {
          this.log(`SSO login failed: ${loginResult.errorMessage}`, 'error');
          throw error;
        }

        // Notify about retry
        options.onRetry?.({
          ...context,
          loginPerformed: true,
        });

        this.log(`Retrying operation after successful login (attempt ${attempt + 1}/${maxAttempts})`, 'info');
      }
    }

    // This should not be reached, but TypeScript needs it
    throw lastError;
  }

  /**
   * Check if auto-login is enabled
   */
  public isAutoLoginEnabled(): boolean {
    return this.options.autoLogin;
  }

  /**
   * Check if interactive mode is enabled
   */
  public isInteractive(): boolean {
    return this.options.interactive;
  }

  /**
   * Validate AWS credentials using AWS CLI (legacy method)
   * WARNING: CLI has separate credential cache from SDK - may give false positives
   *
   * @deprecated Use validateCredentialsAsync() instead for accurate SDK validation
   * @param profile - The AWS profile to validate
   * @param region - Optional AWS region (default: eu-south-1)
   * @returns True if credentials are valid, false otherwise
   */
  public validateCredentials(profile: string, region: string = 'eu-south-1'): boolean {
    const result = spawnSync('aws', [
      'sts',
      'get-caller-identity',
      `--profile=${profile}`,
      `--region=${region}`,
    ], {
      stdio: 'ignore',
      timeout: 10000, // 10 second timeout
    });

    return result.status === 0;
  }

  /**
   * Validate AWS credentials using the SDK (same path as actual operations)
   * This ensures the validation matches what the script will actually use.
   *
   * @param profile - The AWS profile to validate
   * @param region - Optional AWS region (default: eu-south-1)
   * @returns True if credentials are valid, false otherwise
   */
  public async validateCredentialsAsync(profile: string, region: string = 'eu-south-1'): Promise<boolean> {
    try {
      const client = new STSClient({
        region,
        credentials: fromIni({ profile }),
      });

      await client.send(new GetCallerIdentityCommand({}));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure valid AWS credentials, performing SSO login if needed.
   * This should be called BEFORE starting AWS operations to avoid hanging.
   *
   * @param profile - The AWS profile to validate/login
   * @param region - Optional AWS region (default: eu-south-1)
   * @returns True if credentials are valid (or login succeeded), false otherwise
   *
   * @example
   * ```typescript
   * const manager = new GOAWSCredentialsManager({ interactive: true, onPrompt: ... });
   *
   * // Validate credentials before starting heavy AWS work
   * const isValid = await manager.ensureValidCredentials('sso_pn-core-prod');
   * if (!isValid) {
   *   throw new Error('AWS credentials not available');
   * }
   *
   * // Now safe to start AWS operations
   * const client = new CloudWatchClient(config);
   * ```
   */
  public async ensureValidCredentials(profile: string, region: string = 'eu-south-1'): Promise<boolean> {
    // First, check if credentials are already valid using SDK (same path as actual operations)
    if (await this.validateCredentialsAsync(profile, region)) {
      this.log(`AWS credentials valid for profile: ${profile}`, 'info');
      return true;
    }

    this.log(`AWS credentials expired or invalid for profile: ${profile}`, 'warn');

    // Don't auto-login if disabled
    if (!this.options.autoLogin) {
      this.log('Auto-login is disabled', 'warn');
      return false;
    }

    // Prompt user in interactive mode
    if (this.options.interactive && this.onPrompt) {
      const confirmed = await this.onPrompt(
        `AWS SSO session expired. Login to AWS (aws sso login --profile=${profile})?`
      );
      if (!confirmed) {
        this.log('User declined SSO login', 'info');
        return false;
      }
    }

    // Execute SSO login
    const loginResult = await this.executeAWSSSOLogin(profile);

    if (!loginResult.success) {
      this.log(`SSO login failed: ${loginResult.errorMessage}`, 'error');
      return false;
    }

    // Verify credentials after login using SDK
    if (await this.validateCredentialsAsync(profile, region)) {
      this.log(`AWS credentials now valid for profile: ${profile}`, 'info');
      return true;
    }

    this.log('Credentials still invalid after login', 'error');
    return false;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract error message from various error types
   */
  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (typeof error === 'object' && error !== null && 'message' in error) {
      return String((error as { message: unknown }).message);
    }
    return String(error);
  }

  /**
   * Check if error is a CredentialsProviderError from AWS SDK
   */
  private isCredentialsProviderError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    return error.name === 'CredentialsProviderError' ||
      error.constructor.name === 'CredentialsProviderError';
  }

  /**
   * Extract profile name from error message
   */
  private extractProfileFromError(message: string): string | undefined {
    // Pattern: "profile 'name'" or "profile (name)"
    const patterns = [
      /profile ['"]([^'"]+)['"]/i,
      /profile \(([^)]+)\)/i,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(message);
      if (match?.[1]) {
        return match[1];
      }
    }

    return undefined;
  }

  /**
   * Log a message using the configured callback
   */
  private log(message: string, level: 'info' | 'warn' | 'error'): void {
    this.onLog?.(message, level);
  }
}
