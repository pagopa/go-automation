import type { CaseEvaluationTrace } from './CaseEvaluationTrace.js';

/**
 * Trace of an early resolution attempt.
 * Recorded when a step signals `'resolve'` and the engine evaluates
 * known cases mid-pipeline.
 */
export interface EarlyResolutionTrace {
  /** Whether at least one known case matched during the intermediate evaluation */
  readonly resolved: boolean;
  /**
   * IDs of every known case that matched at the early-resolution
   * point, sorted by priority descending. Empty array when none matched.
   */
  readonly matchedCaseIds: ReadonlyArray<string>;
  /** All cases evaluated during this early resolution attempt */
  readonly evaluations: ReadonlyArray<CaseEvaluationTrace>;
}
