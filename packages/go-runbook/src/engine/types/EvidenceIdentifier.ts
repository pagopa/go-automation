import type { EvidenceIdentifierKind } from './EvidenceIdentifierKind.js';

/**
 * A typed identifier (a request, a trace, a correlation id): observed in an evidence element, looked up by a descent
 * or a read, or named by a gap of a read.
 */
export interface EvidenceIdentifier {
  readonly kind: EvidenceIdentifierKind;
  readonly value: string;
}
