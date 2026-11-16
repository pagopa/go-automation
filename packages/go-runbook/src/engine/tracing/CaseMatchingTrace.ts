import type { CaseEvaluationTrace } from './CaseEvaluationTrace.js';

/**
 * Trace of the known case matching process.
 * Documents every case evaluated, the condition applied, and the result.
 */
export interface CaseMatchingTrace {
  /** Total number of cases evaluated */
  readonly casesEvaluated: number;
  /** Detail of each case evaluation */
  readonly evaluations: ReadonlyArray<CaseEvaluationTrace>;
  /**
   * IDs of every known case that matched the final context, sorted by
   * priority descending. Empty array when no case matched.
   */
  readonly matchedCaseIds: ReadonlyArray<string>;
}
