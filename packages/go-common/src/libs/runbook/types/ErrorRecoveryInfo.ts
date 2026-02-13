/**
 * Recovery information for steps that failed but continued execution
 * thanks to the `continueOnFailure` flag (v5 feature).
 */
export interface ErrorRecoveryInfo {
  /** ID of the step that generated the error */
  readonly stepId: string;
  /** Original error message */
  readonly originalError: string;
  /** Timestamp of the failure */
  readonly failedAt: Date;
  /** Indicates the step was skipped and execution continued */
  readonly skipped: true;
}
