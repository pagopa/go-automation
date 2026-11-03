/**
 * Event recorded in the run journal (§11.2).
 *
 * Row events carry `rowIndex`/`rowKey`; `DOCUMENT_UPLOADED` is run-level and
 * feeds the upload cache on resume. `PRESET` imports a row already sent
 * (identifiers from the input, phases without `send`, RF-12).
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
  | 'PRESET'
  | 'REQUEST_ID_FOUND'
  | 'REQUEST_ID_NOT_FOUND'
  | 'WARNING';
