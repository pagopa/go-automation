import type { KnownCaseDetectionOutput } from './KnownCaseDetectionOutput.js';

export interface KnownCaseMatchedOutcome {
  readonly kind: 'known-case-matched';
  /** Every detection, in time order (declaration order on ties, untimed last). */
  readonly detections: ReadonlyArray<KnownCaseDetectionOutput>;
  readonly message: string;
}
