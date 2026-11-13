import type { KnownCaseExtensions } from './KnownCaseExtensions.js';
import type { Condition } from './Condition.js';
import type { CaseAction } from './CaseAction.js';

/**
 * A known case: a recognizable pattern in the final result
 * with an associated action to execute.
 */
export interface KnownCase extends KnownCaseExtensions {
  /** Unique identifier of the case */
  readonly id: string;
  /** Human-readable description of the case */
  readonly description: string;
  /** Condition that must be satisfied to match this case */
  readonly condition: Condition;
  /** Action to execute when the case is recognized */
  readonly action: CaseAction;
  /** Priority: if multiple cases match, the one with higher priority wins */
  readonly priority: number;
}
