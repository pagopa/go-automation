/**
 * Synthetic summary of a runbook execution.
 * Designed for dashboards, notifications, and quick analysis.
 */
export interface ExecutionSummary {
  /** Human-readable description of the execution result */
  readonly description: string;
  /** Total number of steps in the runbook */
  readonly totalSteps: number;
  /** Number of steps actually executed */
  readonly stepsExecuted: number;
  /** Number of steps that failed */
  readonly stepsFailed: number;
  /** Number of steps recovered with continueOnFailure */
  readonly stepsRecovered: number;
  /** Number of steps skipped (not reached by the flow) */
  readonly stepsSkipped: number;
  /** Synthetic outcome: identified case and executed action */
  readonly outcome: string;
  /** Whether the pipeline was terminated early via 'resolve' signal */
  readonly earlyResolution?: boolean;
  /** Step ID that triggered the successful early resolution */
  readonly resolvedAtStep?: string;
}
