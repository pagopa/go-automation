import type { ValidationErrorCodes } from './ValidationErrorCodes.js';

/**
 * Error codes for runbook validation: the keys of {@link ValidationErrorCodes},
 * engine codes plus those added by the toolkits.
 */
export type ValidationErrorCode = keyof ValidationErrorCodes;
