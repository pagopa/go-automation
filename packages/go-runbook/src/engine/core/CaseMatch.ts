import type { IdentifierObservation } from '../types/IdentifierObservation.js';
import type { KnownCase } from '../types/KnownCase.js';

/** A matching case with its evidence, before the replaced cases are removed and the detections ordered. */
export interface CaseMatch {
  readonly knownCase: KnownCase;
  readonly declarationIndex: number;
  readonly firstMs?: number;
  readonly lastMs?: number;
  readonly evidenceRows: number;
  readonly observations: ReadonlyArray<IdentifierObservation>;
  readonly resolvedValues: Readonly<Record<string, unknown>>;
  /** Indices of the evidence elements of each array ref. */
  readonly evidence: ReadonlyMap<string, ReadonlySet<number>>;
}
