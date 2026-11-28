import type { KnownErrorDetectionOutput } from './KnownErrorDetectionOutput.js';

export interface KnownErrorMatchedOutcome {
  readonly kind: 'known-error-matched';
  /** Every detection, in time order (declaration order on ties, untimed last). */
  readonly detections: ReadonlyArray<KnownErrorDetectionOutput>;
  readonly message: string;
}
