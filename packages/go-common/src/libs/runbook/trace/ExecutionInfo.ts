/**
 * Metadata about a runbook execution.
 */
export interface ExecutionInfo {
  /** Unique execution ID */
  readonly executionId: string;
  /** Runbook ID */
  readonly runbookId: string;
  /** Runbook version */
  readonly runbookVersion: string;
  /** Execution start timestamp */
  readonly startedAt: Date;
  /** Execution end timestamp */
  readonly endedAt: Date;
  /** Duration in milliseconds */
  readonly durationMs: number;
  /** Number of steps executed */
  readonly stepsExecuted: number;
  /** Maximum iterations configured */
  readonly maxIterations: number;
}
