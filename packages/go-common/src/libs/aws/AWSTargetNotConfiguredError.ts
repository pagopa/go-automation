/**
 * Why the configured AWS profiles cannot read an execution target.
 *
 * `AWS_PROFILE_IDENTITY_UNAVAILABLE` is the recoverable one: a profile may well
 * own the account, but its credentials could not be checked — usually an
 * expired SSO session, fixed by logging in again rather than by configuration.
 */
export type AWSTargetNotConfiguredCode =
  'AWS_ACCOUNT_NOT_CONFIGURED' | 'AWS_REGION_NOT_CONFIGURED' | 'AWS_PROFILE_IDENTITY_UNAVAILABLE';

const CODES: ReadonlySet<string> = new Set([
  'AWS_ACCOUNT_NOT_CONFIGURED',
  'AWS_REGION_NOT_CONFIGURED',
  'AWS_PROFILE_IDENTITY_UNAVAILABLE',
]);

/**
 * Raised when no configured AWS profile can read the requested target.
 *
 * A configuration fault, not a runtime one: deterministic for the whole run, so
 * consumers classify it from the code instead of matching on the message.
 */
export class AWSTargetNotConfiguredError extends Error {
  constructor(
    public readonly code: AWSTargetNotConfiguredCode,
    message: string,
  ) {
    super(message);
    this.name = 'AWSTargetNotConfiguredError';
  }
}

/**
 * Checks the `code` rather than the prototype chain, so the classification
 * survives the error crossing a package boundary.
 *
 * @param error - The value to test
 * @returns True when the value is a target-not-configured error
 */
export function isAWSTargetNotConfiguredError(error: unknown): error is AWSTargetNotConfiguredError {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' && CODES.has(error.code);
}
