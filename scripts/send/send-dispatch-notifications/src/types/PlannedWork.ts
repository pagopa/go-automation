/**
 * What this session will do, for confirmation, estimate and progress.
 */
export interface PlannedWork {
  /** Rows to confirm: rows to send, or rows to process when the session sends nothing. */
  readonly rows: number;
  /** Whether the session sends notifications (otherwise it only verifies or looks up requestIds). */
  readonly sending: boolean;
}
