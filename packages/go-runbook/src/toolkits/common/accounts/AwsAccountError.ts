import type { AwsAccountErrorCode } from './AwsAccountErrorCode.js';

/**
 * An execution cannot read the AWS accounts its runbook declares
 * (EVO-AWSACCT-OPUS-01 §6.3, §6.4). Raised before the first step; the
 * {@link code} tells the cloud worker it is a configuration failure, not a transient one.
 */
export class AwsAccountError extends Error {
  override readonly name = 'AwsAccountError';

  /**
   * @param code - Stable error code
   * @param message - Description naming the logical account, environment and configuration key involved
   */
  constructor(
    readonly code: AwsAccountErrorCode,
    message: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Type guard for {@link AwsAccountError}, also across module copies (checks the name and code).
 *
 * @param error - Any thrown value
 * @returns Whether it is an account error
 */
export function isAwsAccountError(error: unknown): error is AwsAccountError {
  return (
    error instanceof AwsAccountError ||
    (error instanceof Error &&
      error.name === 'AwsAccountError' &&
      typeof (error as { code?: unknown }).code === 'string')
  );
}
