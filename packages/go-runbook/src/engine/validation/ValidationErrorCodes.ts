/**
 * Registry of the validation error codes: the keys are the codes. Toolkits add
 * their codes by module augmentation, so {@link ValidationErrorCode} stays one
 * type for every validator (EVO-RBREORG-OPUS-01 §7.1.3 F).
 */
export interface ValidationErrorCodes {
  readonly DUPLICATE_STEP_ID: true;
  readonly INVALID_GOTO_REF: true;
  readonly LOOP_DETECTED: true;
  readonly DUPLICATE_CASE_ID: true;
  readonly DUPLICATE_CASE_PRIORITY: true;
  readonly MISSING_METADATA: true;
  readonly MISSING_FALLBACK: true;
  readonly EMPTY_STEPS: true;
}
