/**
 * Error attached to a row, as shown in the report.
 */
export interface RowError {
  readonly code: string;
  readonly message: string;
  /** Compact JSON of `problem.errors[]` or of the `REFUSED` errors. */
  readonly details?: string;
  /** Whether a later `--retry-failed` may send the row again. */
  readonly retryable?: boolean;
}
