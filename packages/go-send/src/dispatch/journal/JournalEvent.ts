/**
 * Event recorded in the run journal (§11.2).
 *
 * Row events carry `rowIndex`/`rowKey`; `DOCUMENT_UPLOADED` is run-level and
 * feeds the upload cache on resume. `PRESET` imports a row already sent
 * (identifiers from the input, phases without `send`, RF-12).
 * `ROW_REVALIDATED` brings back to `PENDING` a row a previous session
 * recorded as `INVALID` and that now validates (input mapping or documents
 * fixed before the resume). `SEND_DEFERRED` brings back to `PENDING` a row
 * whose last POST SEND rejected with `429` when the run stopped before the
 * next attempt: SEND never created it, so a plain resume sends it.
 */
export type JournalEvent =
  | 'ROW_INVALID'
  | 'ROW_REVALIDATED'
  | 'SEND_DEFERRED'
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
