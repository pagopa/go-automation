import type { Condition } from '../types/Condition.js';

/**
 * Trace of the evaluation of a single known case.
 * Includes the condition, resolved values, match result and, for a match, its time.
 */
export interface CaseEvaluationTrace {
  /** Known case ID */
  readonly caseId: string;
  /** Human-readable case description */
  readonly description: string;
  /** Condition evaluated (see Condition DSL) */
  readonly condition: Condition;
  /** Whether the condition matched */
  readonly matched: boolean;
  /** Actual values of the variables referenced in the condition */
  readonly resolvedValues: Readonly<Record<string, unknown>>;
  /** First evidence satisfying the case (ISO-8601 UTC), for a timed match. */
  readonly firstSeenAt?: string;
  /** Last evidence satisfying the case (ISO-8601 UTC), for a timed match. */
  readonly lastSeenAt?: string;
  /** Evidence rows behind a match. */
  readonly evidenceRows?: number;
  /** The case that replaced this one, when both matched (see `KnownCase.supersedes`). */
  readonly supersededBy?: string;
  /** Error-tree node the case was evaluated on; absent for a window-level runbook. */
  readonly nodeId?: string;
}
