import type { EvidenceIdentifierKind } from './EvidenceIdentifierKind.js';

/** One identifier of a grouped read of a level. */
export interface TreeReadIdentifier {
  readonly kind: EvidenceIdentifierKind;
  readonly value: string;
}
