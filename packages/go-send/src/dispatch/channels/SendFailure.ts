import type { SendFailureKind } from './SendFailureKind.js';

/**
 * Classified failure of a `POST requests`.
 */
export interface SendFailure {
  readonly kind: SendFailureKind;
  readonly code: string;
  readonly message: string;
  readonly status?: number;
  /** Compact JSON of `problem.errors[]`. */
  readonly details?: string;
  readonly retryAfterMs?: number;
}
