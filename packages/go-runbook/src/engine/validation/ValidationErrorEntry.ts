import type { ValidationErrorCode } from './ValidationErrorCode.js';

/**
 * A single validation error entry.
 */
export interface ValidationErrorEntry {
  /** Error code for programmatic identification */
  readonly code: ValidationErrorCode;
  /** Human-readable message */
  readonly message: string;
  /** ID of the involved step (if applicable) */
  readonly stepId?: string;
  /** ID of the involved KnownCase (if applicable) */
  readonly caseId?: string;
}
