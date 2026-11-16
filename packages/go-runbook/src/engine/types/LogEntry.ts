/**
 * A log entry produced during runbook execution.
 */
export interface LogEntry {
  /** Timestamp of the log entry */
  readonly timestamp: Date;
  /** Log level */
  readonly level: 'info' | 'warn' | 'error';
  /** Log message */
  readonly message: string;
  /** ID of the step that produced this entry (if applicable) */
  readonly stepId?: string;
}
