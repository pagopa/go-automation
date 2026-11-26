import type { EvidenceRetention } from './EvidenceRetention.js';

export interface StepEvidenceBase {
  readonly id: string;
  readonly label: string;
  readonly retention: EvidenceRetention;
  /** Split outputs containing multiple query result sets without losing provenance. */
  readonly filter?: { readonly field: string; readonly equals: string };
}
