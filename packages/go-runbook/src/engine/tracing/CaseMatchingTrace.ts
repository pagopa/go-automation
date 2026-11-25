import type { CaseEvaluationTrace } from './CaseEvaluationTrace.js';

/**
 * Trace of the known case matching process.
 * Documents every case evaluated, the condition applied, and the result.
 */
export interface CaseMatchingTrace {
  /** Total number of cases evaluated */
  readonly casesEvaluated: number;
  /** Detail of each case evaluation, in declaration order */
  readonly evaluations: ReadonlyArray<CaseEvaluationTrace>;
  /**
   * IDs of the detections, in the order of the detections: `firstSeenAt` ascending, declaration order on ties,
   * untimed last. Superseded cases are not listed. Empty when no case matched.
   */
  readonly matchedCaseIds: ReadonlyArray<string>;
}
