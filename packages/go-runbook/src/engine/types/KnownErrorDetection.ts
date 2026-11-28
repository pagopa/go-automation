import type { IdentifierObservation } from './IdentifierObservation.js';
import type { KnownError } from './KnownError.js';

/**
 * A known error that matched the evidence, with its time.
 *
 * Detections replace the old "case that wins": every matching case is reported, ordered by `firstSeenAt`.
 */
export interface KnownErrorDetection {
  readonly knownError: KnownError;
  /** First evidence satisfying the case (ISO-8601 UTC); absent when the evidence has no time. */
  readonly firstSeenAt?: string;
  /** Last evidence satisfying the case (ISO-8601 UTC). */
  readonly lastSeenAt?: string;
  /** Evidence rows behind the case; an aggregate row counts its `count`. Never a number of errors. */
  readonly evidenceRows: number;
  /** Typed identifiers read from the evidence, each with its own time. */
  readonly observations: ReadonlyArray<IdentifierObservation>;
}
