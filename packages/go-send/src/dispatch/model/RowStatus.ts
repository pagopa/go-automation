/**
 * State of a row (§6.2). `DRY_RUN` marks rows of a dry run.
 */
export type RowStatus =
  | 'PENDING'
  | 'INVALID'
  | 'DRY_RUN'
  | 'UPLOADING'
  | 'SENDING'
  | 'RECONCILING'
  | 'SENT'
  | 'SEND_FAILED'
  | 'SEND_UNCERTAIN'
  | 'VERIFYING'
  | 'ACCEPTED'
  | 'REFUSED'
  | 'VERIFY_TIMEOUT'
  | 'REQUEST_ID_FOUND'
  | 'REQUEST_ID_NOT_FOUND'
  | 'DONE';
