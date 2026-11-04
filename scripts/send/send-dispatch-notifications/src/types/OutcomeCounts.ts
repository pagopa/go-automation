/**
 * Row outcomes derived from the status counts, shared by the progress line
 * and the final summary.
 */
export interface OutcomeCounts {
  /** Accepted by SEND: `ACCEPTED` plus the requestId statuses that follow it. */
  readonly accepted: number;
  /** Sent: `SENT`, accepted, `REFUSED` and `VERIFY_TIMEOUT`. */
  readonly sent: number;
  /** `SEND_FAILED` plus `SEND_UNCERTAIN`. */
  readonly errors: number;
}
