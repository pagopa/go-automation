import type { Condition } from './Condition.js';
import type { Step } from './Step.js';

/**
 * Configuration for an inline if-branch with sub-pipelines.
 * The then/else pipelines are executed inline in a child context.
 */
export interface IfBranchConfig {
  /** Unique step ID */
  readonly id: string;
  /** Human-readable label */
  readonly label: string;
  /** Condition to evaluate */
  readonly condition: Condition;
  /** Steps to execute if condition is true */
  readonly thenSteps: ReadonlyArray<Step>;
  /** Steps to execute if condition is false */
  readonly elseSteps?: ReadonlyArray<Step>;
}
