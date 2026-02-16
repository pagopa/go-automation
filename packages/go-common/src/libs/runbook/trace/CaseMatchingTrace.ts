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
  /** ID of the matched case (null if no match) */
  readonly matchedCaseId: string | null;
}
