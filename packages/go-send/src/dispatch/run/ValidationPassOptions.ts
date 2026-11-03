import type { LocalDocumentInspector } from '../documents/LocalDocumentInspector.js';
import type { InputReader } from '../input/InputReader.js';
import type { RowLedger } from '../journal/RowLedger.js';
import type { RecordFactory } from '../mapping/RecordFactory.js';

/**
 * Options of {@link ./runValidationPass.runValidationPass}.
 */
export interface ValidationPassOptions {
  readonly reader: InputReader;
  readonly factory: RecordFactory;
  readonly inspector: LocalDocumentInspector;
  /** Invalid rows are recorded here as `ROW_INVALID`. */
  readonly ledger: RowLedger;
  readonly runId: string;
}
