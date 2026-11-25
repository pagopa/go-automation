/**
 * Result of an AWS SSO login attempt
 */
export interface GOAWSLoginResult {
  /** Whether login was successful */
  readonly success: boolean;
  /** The profile that was logged in */
  readonly profile: string;
  /** Duration of login process in milliseconds */
  readonly duration: number;
  /** Error message if login failed */
  readonly errorMessage?: string | undefined;
  /** Exit code from the AWS CLI */
  readonly exitCode?: number | undefined;
}
