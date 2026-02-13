import type { StepKind } from './StepKind.js';
import type { StepResult } from './StepResult.js';
import type { RunbookContext } from './RunbookContext.js';

/**
 * Base interface for all runbook steps.
 * Each step is an autonomous component: receives a context, produces a result.
 *
 * @typeParam TOutput - The type of output produced by the step
 */
export interface Step<TOutput = unknown> {
  /** Unique identifier of the step within the runbook */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** Step category (for logging and filtering) */
  readonly kind: StepKind;
  /** Executes the step and returns the result */
  execute(context: RunbookContext): Promise<StepResult<TOutput>>;
}
