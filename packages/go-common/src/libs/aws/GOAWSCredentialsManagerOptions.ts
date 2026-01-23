/**
 * Configuration options for GOAWSCredentialsManager
 */
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
   * Callback for logging messages
   */
  readonly onLog?: ((message: string, level: 'info' | 'warn' | 'error') => void) | undefined;

  /**
   * Callback for user prompts
   * Return true to proceed with login, false to skip
   */
  readonly onPrompt?: ((message: string) => Promise<boolean>) | undefined;
}
