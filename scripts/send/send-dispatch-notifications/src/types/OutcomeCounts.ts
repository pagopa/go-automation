/**
 * Row outcomes shared by the progress line and the final summary.
 */
export interface OutcomeCounts {
  /** Accepted by SEND, from explicit evidence (`Dispatch.acceptanceOf`), not from the status alone. */
  readonly accepted: number;
  /** Refused by SEND: by the verification or by a `REQUEST_REFUSED` timeline. */
  readonly refused: number;
  /** Sent: `SENT` and every status after it (`ACCEPTED`, `REFUSED`, `VERIFY_TIMEOUT`, `REQUEST_ID_*`). */
  readonly sent: number;
  /** `SEND_FAILED` plus `SEND_UNCERTAIN`. */
  readonly errors: number;
}
