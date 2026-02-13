/**
 * High-level summary of a runbook execution for dashboards and LLM consumption.
 */
export interface ExecutionSummary {
  /** Final status */
  readonly status: 'completed' | 'failed' | 'stopped';
  /** Total steps executed */
  readonly totalSteps: number;
  /** Steps that succeeded */
  readonly successfulSteps: number;
  /** Steps that failed */
  readonly failedSteps: number;
  /** Steps skipped due to continueOnFailure */
  readonly skippedSteps: number;
  /** Whether a known case was matched */
  readonly caseMatched: boolean;
  /** ID of the matched case (if any) */
  readonly matchedCaseId?: string;
  /** Total execution duration in milliseconds */
  readonly durationMs: number;
  /** Final variables snapshot */
  readonly finalVars: Readonly<Record<string, string>>;
}
