import type { CaseEvaluationTrace } from './CaseEvaluationTrace.js';

/**
 * Trace of an early resolution attempt.
 * Recorded when a step signals `'resolve'` and the engine evaluates
 * known cases mid-pipeline.
 */
export interface EarlyResolutionTrace {
  /** Whether a known case matched during the intermediate evaluation */
  readonly resolved: boolean;
  /** ID of the matched known case (undefined if no match) */
  readonly matchedCaseId?: string;
  /** All cases evaluated during this early resolution attempt */
  readonly evaluations: ReadonlyArray<CaseEvaluationTrace>;
}
