/**
 * AWSMultiProfileValidationResult - Aggregated result of validating multiple AWS profiles
 */

import type { AWSProfileValidationSuccess, AWSProfileValidationFailure } from './AWSProfileValidationResult.js';

/**
 * Aggregated result from validating multiple AWS profiles
 */
export interface AWSMultiProfileValidationResult {
  /** Successfully validated profiles */
  readonly successfulProfiles: ReadonlyArray<AWSProfileValidationSuccess>;

  /** Failed profile validations */
  readonly failedProfiles: ReadonlyArray<AWSProfileValidationFailure>;

  /** Whether all profiles succeeded */
  readonly allSucceeded: boolean;

  /** Total number of profiles validated */
  readonly profileCount: number;

  /** List of valid profile names (convenience accessor) */
  readonly validProfileNames: ReadonlyArray<string>;
}
