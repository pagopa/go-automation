/**
 * AWSProfileValidationResult - Result of validating a single AWS profile
 */

/**
 * Result of validating a single AWS profile's credentials
 */
export type AWSProfileValidationResult = AWSProfileValidationSuccess | AWSProfileValidationFailure;

/**
 * Successful profile validation result
 */
export interface AWSProfileValidationSuccess {
  readonly status: 'success';
  readonly profile: string;
  readonly accountId?: string;
}

/**
 * Failed profile validation result
 */
export interface AWSProfileValidationFailure {
  readonly status: 'failure';
  readonly profile: string;
  readonly error: Error;
  readonly isRecoverable: boolean;
}

/**
 * Type guard for successful profile validation
 * @param result - The validation result to check
 * @returns True if the result represents a successful validation
 */
export function isProfileValidationSuccess(
  result: AWSProfileValidationResult,
): result is AWSProfileValidationSuccess {
  return result.status === 'success';
}

/**
 * Type guard for failed profile validation
 * @param result - The validation result to check
 * @returns True if the result represents a failed validation
 */
export function isProfileValidationFailure(
  result: AWSProfileValidationResult,
): result is AWSProfileValidationFailure {
  return result.status === 'failure';
}
