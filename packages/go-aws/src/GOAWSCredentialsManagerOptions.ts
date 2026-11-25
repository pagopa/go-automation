/**
 * Configuration options for GOAWSCredentialsManager
 */
export type GOAWSCredentialsLogHandler = (message: string, level: 'info' | 'warn' | 'error') => void;

export type GOAWSCredentialsPromptHandler = (message: string) => Promise<boolean>;

export interface GOAWSCredentialsManagerOptions {
  /**
   * Enable automatic SSO login on credential expiration
   * Default: true
   */
  readonly autoLogin?: boolean | undefined;

  /**
   * Enable interactive mode (prompt user before login)
   * Default: true
   * When false, auto-login proceeds without prompting (CI mode)
   */
  readonly interactive?: boolean | undefined;

  /**
   * Maximum number of retry attempts after login
   * Default: 1
   */
  readonly maxRetries?: number | undefined;

  /**
   * Timeout for SSO login process in milliseconds
   * Default: 120000 (2 minutes)
   */
  readonly loginTimeout?: number | undefined;

  /**
   * Handler for logging messages
   */
  readonly onLog?: GOAWSCredentialsLogHandler | undefined;

  /**
   * Handler for user prompts
   * Return true to proceed with login, false to skip
   */
  readonly onPrompt?: GOAWSCredentialsPromptHandler | undefined;
}
