import type { Step } from './Step.js';

/**
 * Descriptor wrapping a step with execution options.
 * Associates a step with runtime configuration like `continueOnFailure`.
 *
 * @typeParam TOutput - The type of output produced by the wrapped step
 */
export interface StepDescriptor<TOutput = unknown> {
  /** The step to execute */
  readonly step: Step<TOutput>;
  /** If true, a step failure does not interrupt execution */
  readonly continueOnFailure?: boolean;
  /**
   * When `true`, the engine does not emit its default
   * `[step.id] step.label` line on stdout for this step. Steps that
   * render their own structured progress (e.g. via a dedicated reporter)
   * use this flag to keep the user-facing output clean.
   */
  readonly silent?: boolean;
}
