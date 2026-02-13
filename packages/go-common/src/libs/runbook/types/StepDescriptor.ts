import type { Step } from './Step.js';

/**
 * Descriptor wrapping a step with execution options (v5 feature).
 * Associates a step with runtime configuration like `continueOnFailure`.
 *
 * @typeParam TOutput - The type of output produced by the wrapped step
 */
export interface StepDescriptor<TOutput = unknown> {
  /** The step to execute */
  readonly step: Step<TOutput>;
  /** If true, a step failure does not interrupt execution */
  readonly continueOnFailure?: boolean;
}
