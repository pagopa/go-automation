declare module '../../../engine/validation/ValidationErrorCodes.js' {
  /** Validation codes of the operational builders. */
  interface ValidationErrorCodes {
    readonly INVALID_OUTPUT_DEFINITION: true;
    readonly INVALID_OCCURRENCE_TIME_WINDOW: true;
  }
}

/** Marker that loads the operational validation codes. */
export type ValidationErrorCodesAugmentation = 'validationErrorCodes';
