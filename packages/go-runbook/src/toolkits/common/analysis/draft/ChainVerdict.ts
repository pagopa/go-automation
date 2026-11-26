import type { KnownCaseAnalysis } from '../KnownCaseAnalysis.js';

/** What the chains of an error tree say about closing and ignoring the occurrence. */
export interface ChainVerdict {
  /** A chain ends in a true leaf recognized by a case that proposes `COMPLETED`. */
  readonly completed: boolean;
  /** The analyses of the cases every chain ends in; absent when a chain ends unrecognized or interrupted. */
  readonly endAnalyses?: ReadonlyArray<KnownCaseAnalysis>;
}
