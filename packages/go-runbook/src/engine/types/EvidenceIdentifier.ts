import type { EvidenceIdentifierKind } from './EvidenceIdentifierKind.js';

/** A typed identifier observed in an evidence element (a request, a trace, a correlation id). */
export interface EvidenceIdentifier {
  readonly kind: EvidenceIdentifierKind;
  readonly value: string;
}
