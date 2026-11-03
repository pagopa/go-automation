import type { CanonicalField } from './CanonicalField.js';

/**
 * A reason why a row is `INVALID`.
 */
export interface ValidationIssue {
  /** Stable code (e.g. `MISSING_FIELD`, `INVALID_FORMAT`, `SENDER_MISMATCH`). */
  readonly code: string;
  readonly field?: CanonicalField;
  readonly message: string;
}
