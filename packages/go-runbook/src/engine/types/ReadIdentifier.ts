import type { EvidenceIdentifierKind } from './EvidenceIdentifierKind.js';

/** An identifier a read is made for, or a gap of a read names. */
export interface ReadIdentifier {
  readonly kind: EvidenceIdentifierKind;
  readonly value: string;
}
