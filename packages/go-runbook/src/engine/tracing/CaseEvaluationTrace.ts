import type { Condition } from '../types/Condition.js';

/**
 * Trace of the evaluation of a single known case.
 * Includes the condition, resolved values, and match result.
 */
export interface CaseEvaluationTrace {
  /** Known case ID */
  readonly caseId: string;
  /** Human-readable case description */
  readonly description: string;
  /** Case priority (evaluation order, descending) */
  readonly priority: number;
  /** Condition evaluated (see Condition DSL) */
  readonly condition: Condition;
  /** Whether the condition matched */
  readonly matched: boolean;
  /** Actual values of the variables referenced in the condition */
  readonly resolvedValues: Readonly<Record<string, unknown>>;
}
