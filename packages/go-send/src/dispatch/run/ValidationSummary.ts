import type { DocumentSourceKind } from '../model/DocumentSourceKind.js';

/**
 * Result of the validation pass: everything the send plan shows (§14.2).
 *
 * On resume `validRows` also counts the rows a previous session already
 * processed: what this session will actually do is `rowsToSend` /
 * `rowsToProcess`. The plan figures (`products`, `senders`, `groups`,
 * `documentSources`, `rowFiles`, `distinctRowFiles`, `digitalRows`) describe
 * the rows to send only.
 */
export interface ValidationSummary {
  readonly totalRows: number;
  /** Valid rows, including those already processed by a previous session. */
  readonly validRows: number;
  readonly invalidRows: number;
  /** Rows this session sends (or reconciles): their action is `send`. */
  readonly rowsToSend: number;
  /** Rows this session works on: actions `send`, `verify` and `request-id`. */
  readonly rowsToProcess: number;
  /** Row keys used by more than one row: blocking, nothing is sent. */
  readonly duplicateRowKeys: ReadonlyArray<string>;
  /**
   * Direct mode: requestIds rendered for more than one row. Blocking, nothing
   * is sent: pn-external-channels would answer `409` to every row after the
   * first, which is journaled as `SENT`.
   */
  readonly duplicateRequestIds: ReadonlyArray<string>;
  /** Count by canonical product (`AR`, `890`) of the rows to send. */
  readonly products: ReadonlyMap<string, number>;
  /** Count by `taxId — denomination` of the sender of the rows to send. */
  readonly senders: ReadonlyMap<string, number>;
  /** Count by `group` of the rows to send (empty string = no group). */
  readonly groups: ReadonlyMap<string, number>;
  /** Count by document source of the rows to send. */
  readonly documentSources: ReadonlyMap<DocumentSourceKind, number>;
  /** Row files to upload for the rows to send, and how many distinct contents. */
  readonly rowFiles: number;
  readonly distinctRowFiles: number;
  /** Rows to send with a digital domicile. */
  readonly digitalRows: number;
}
