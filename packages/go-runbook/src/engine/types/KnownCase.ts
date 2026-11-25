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
  /**
   * Cases this one replaces when both match: a more precise explanation of the same error. The replaced cases leave
   * the detections and stay in the trace with `supersededBy`.
   */
  readonly supersedes?: ReadonlyArray<string>;
}
