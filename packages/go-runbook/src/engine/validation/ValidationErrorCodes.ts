/**
 * Registry of the validation error codes: the keys are the codes. Toolkits add
 * their codes by module augmentation, so {@link ValidationErrorCode} stays one
 * type for every validator.
 */
export interface ValidationErrorCodes {
  readonly DUPLICATE_STEP_ID: true;
  readonly DUPLICATE_KNOWN_ERROR_CODE: true;
  readonly UNKNOWN_SUPERSEDED_CASE: true;
  readonly SUPERSEDES_CYCLE: true;
  readonly MISSING_METADATA: true;
  readonly MISSING_FALLBACK: true;
  readonly EMPTY_STEPS: true;
  readonly UNWIRED_CASE_STEP_REF: true;
  readonly INVALID_ERROR_TREE: true;
  readonly UNANCHORED_ROW_PREDICATES: true;
}
