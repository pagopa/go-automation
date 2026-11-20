import type { EvidenceIdentifier } from './EvidenceIdentifier.js';

/** An identifier read from an evidence element, with the instant it was observed at when the element knows it. */
export interface TimedEvidenceIdentifier extends EvidenceIdentifier {
  /** Epoch milliseconds of the row that carried the identifier; absent when that row has no time. */
  readonly at?: number;
}
