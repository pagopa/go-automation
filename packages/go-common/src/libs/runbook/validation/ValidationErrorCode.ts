/**
 * Error codes for runbook validation.
 */
export type ValidationErrorCode =
  | 'DUPLICATE_STEP_ID'
  | 'INVALID_GOTO_REF'
  | 'LOOP_DETECTED'
  | 'DUPLICATE_CASE_ID'
  | 'DUPLICATE_CASE_PRIORITY'
  | 'MISSING_METADATA'
  | 'MISSING_FALLBACK'
  | 'EMPTY_STEPS';
