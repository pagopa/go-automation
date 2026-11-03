import type { DocumentSourceKind } from '../model/DocumentSourceKind.js';

/**
 * Result of the validation pass: everything the send plan shows (§14.2).
 */
export interface ValidationSummary {
  readonly totalRows: number;
  readonly validRows: number;
  readonly invalidRows: number;
  /** Row keys used by more than one row: blocking, nothing is sent. */
  readonly duplicateRowKeys: ReadonlyArray<string>;
  /** Count by canonical product (`AR`, `890`). */
  readonly products: ReadonlyMap<string, number>;
  /** Count by `taxId — denomination` of the sender. */
  readonly senders: ReadonlyMap<string, number>;
  /** Count by `group` of the rows (empty string = no group). */
  readonly groups: ReadonlyMap<string, number>;
  /** Count by document source. */
  readonly documentSources: ReadonlyMap<DocumentSourceKind, number>;
  /** Row files to upload, and how many distinct contents. */
  readonly rowFiles: number;
  readonly distinctRowFiles: number;
  /** Rows with a digital domicile. */
  readonly digitalRows: number;
}
