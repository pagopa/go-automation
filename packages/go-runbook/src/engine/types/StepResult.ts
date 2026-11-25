import type { FlowDirective } from './FlowDirective.js';
import type { StepDiagnostics } from '../tracing/StepDiagnostics.js';
import type { StepCoverage } from './StepCoverage.js';
import type { ObservedErrors } from './ObservedErrors.js';
import type { DescendRequest } from './DescendRequest.js';

/**
 * Result of a step execution.
 * Encapsulates the output, success status, and flow control directives.
 *
 * @typeParam TOutput - The type of output produced by the step
 */
export interface StepResult<TOutput = unknown> {
  /** Whether the step executed successfully */
  readonly success: boolean;
  /** Output produced by the step (undefined if success=false) */
  readonly output?: TOutput;
  /** Error message (only if success=false) */
  readonly error?: string;
  /** Variables to add/update in the context */
  readonly vars?: Readonly<Record<string, string>>;
  /** Non-functional execution diagnostics captured in trace only. */
  readonly diagnostics?: StepDiagnostics;
  /** Flow directive: which step to execute next */
  readonly next?: FlowDirective;
  /** Partial evidence declared by the step, one entry per source; absent means complete. */
  readonly coverage?: ReadonlyArray<StepCoverage>;
  /** Errors observed and examined, declared by a step that enumerates the errors of the window. */
  readonly observedErrors?: ObservedErrors;
  /** Descents requested by a step of an error-tree node: where to look for the errors of the same operation below. */
  readonly descend?: ReadonlyArray<DescendRequest>;
}
