/**
 * Event recorded in the run journal (§11.2).
 *
 * Row events carry `rowIndex`/`rowKey`; `DOCUMENT_UPLOADED` is run-level and
 * feeds the upload cache on resume.
 */
export type JournalEvent =
  | 'ROW_INVALID'
  | 'DOCUMENT_UPLOADED'
  | 'SENDING'
  | 'SENT'
  | 'SEND_FAILED'
  | 'RECONCILING'
  | 'SEND_UNCERTAIN'
  | 'ACCEPTED'
  | 'REFUSED'
  | 'VERIFY_TIMEOUT'
  | 'WARNING';
