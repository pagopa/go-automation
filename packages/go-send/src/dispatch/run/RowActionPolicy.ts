/**
 * Phases and retry flags that decide what happens to a row on (re)start.
 */
export interface RowActionPolicy {
  /** Resend `SEND_FAILED` rows marked retryable (`--retry-failed`). */
  readonly retryFailed: boolean;
  /** Reconcile `SEND_UNCERTAIN` rows. */
  readonly retryUncertain: boolean;
  readonly verify: boolean;
  readonly requestId: boolean;
}
