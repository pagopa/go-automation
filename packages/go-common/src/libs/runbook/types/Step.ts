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
  /**
   * Returns step-specific trace information for debugging and audit.
   * Called by the engine before execute() to capture resolved configuration
   * (interpolated queries, URLs, expressions, etc.) in the execution trace.
   *
   * Optional: steps that have no meaningful trace info can omit this method.
   *
   * @param context - The runbook execution context (for template interpolation)
   * @returns Key-value record of resolved step configuration
   */
  getTraceInfo?(context: RunbookContext): Readonly<Record<string, unknown>>;
}
