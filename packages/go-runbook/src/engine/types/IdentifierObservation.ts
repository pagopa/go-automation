import type { EvidenceIdentifier } from './EvidenceIdentifier.js';

/** A typed identifier observed in the evidence of a detection, with its own time. */
export interface IdentifierObservation extends EvidenceIdentifier {
  /** ISO-8601 UTC instant at which this identifier was observed, when the evidence has one. */
  readonly observedAt?: string;
}
