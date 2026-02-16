import type { FlowDirectiveString } from '../types/FlowDirective.js';
import type { StepKind } from '../types/StepKind.js';
import type { EarlyResolutionTrace } from './EarlyResolutionTrace.js';

/**
 * Trace of a single step execution in the pipeline.
 * Contains input, output, variables written, duration, and flow directive.
 */
export interface StepTrace {
  /** Execution order (1-based) */
  readonly executionOrder: number;
  /** Unique step ID */
  readonly stepId: string;
  /** Human-readable step label */
  readonly label: string;
  /** Step category (data, transform, control, check, mutation) */
  readonly kind: StepKind;
  /** How the step was reached in the execution flow */
  readonly reachedVia: 'sequential' | 'goTo' | 'subPipeline';
  /** Parent step ID (only if reachedVia === 'subPipeline') */
  readonly parentStepId?: string;
  /** Step execution start timestamp (ISO 8601) */
  readonly startedAt: string;
  /** Step execution completion timestamp (ISO 8601) */
  readonly completedAt: string;
  /** Duration in milliseconds */
  readonly durationMs: number;
  /** Step execution status */
  readonly status: 'success' | 'failed' | 'skipped';
  /** Whether the step was recovered via continueOnFailure */
  readonly recovered: boolean;
  /** Input provided to the step */
  readonly input: unknown;
  /** Output produced by the step */
  readonly output: unknown;
  /** Error message (only if status === 'failed') */
  readonly error?: string;
  /** Variables written to the context by this step */
  readonly varsWritten: Readonly<Record<string, string>>;
  /** Flow directive produced: 'continue', 'stop', 'resolve', or target step ID for goTo */
  readonly flowDirective: FlowDirectiveString;
  /** Result of early resolution attempt when step signaled 'resolve' */
  readonly earlyResolution?: EarlyResolutionTrace;
}
