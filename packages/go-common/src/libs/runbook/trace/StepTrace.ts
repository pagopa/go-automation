import type { StepKind } from '../types/StepKind.js';

/**
 * Trace information for a single step execution.
 */
export interface StepTrace {
  /** Step ID */
  readonly stepId: string;
  /** Step label */
  readonly label: string;
  /** Step kind */
  readonly kind: StepKind;
  /** Execution start timestamp */
  readonly startedAt: Date;
  /** Execution end timestamp */
  readonly endedAt: Date;
  /** Duration in milliseconds */
  readonly durationMs: number;
  /** Whether the step succeeded */
  readonly success: boolean;
  /** Error message if failed */
  readonly error?: string;
  /** Whether continueOnFailure was active */
  readonly continueOnFailure: boolean;
  /** Whether the step was skipped due to failure recovery */
  readonly skipped: boolean;
}
