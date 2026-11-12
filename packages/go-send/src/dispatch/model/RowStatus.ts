/**
 * State of a row (§6.2), as produced by the journal reducer
 * (`applyJournalEntry`). Rows never journaled have no status: the
 * materializer shows them as `PENDING`, or `DRY_RUN` in a dry run.
 */
export type RowStatus =
  | 'PENDING'
  | 'INVALID'
  | 'SENDING'
  | 'RECONCILING'
  | 'SENT'
  | 'SEND_FAILED'
  | 'SEND_UNCERTAIN'
  | 'ACCEPTED'
  | 'REFUSED'
  | 'VERIFY_TIMEOUT'
  | 'REQUEST_ID_FOUND'
  | 'REQUEST_ID_NOT_FOUND';
