import type { FlowDirective } from './FlowDirective.js';
import type { ErrorRecoveryInfo } from './ErrorRecoveryInfo.js';

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
  /** Flow directive: which step to execute next */
  readonly next?: FlowDirective;
  /**
   * (v5) Recovery information if the step failed but execution continued
   * thanks to continueOnFailure.
   */
  readonly errorRecovery?: ErrorRecoveryInfo;
}
