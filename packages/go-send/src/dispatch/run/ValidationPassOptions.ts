import type { LocalDocumentInspector } from '../documents/LocalDocumentInspector.js';
import type { InputReader } from '../input/InputReader.js';
import type { RowLedger } from '../journal/RowLedger.js';
import type { RecordFactory } from '../mapping/RecordFactory.js';
import type { RowActionPolicy } from './RowActionPolicy.js';

/**
 * Options of {@link ./runValidationPass.runValidationPass}.
 */
export interface ValidationPassOptions {
  readonly reader: InputReader;
  readonly factory: RecordFactory;
  readonly inspector: LocalDocumentInspector;
  /** Invalid rows are recorded here as `ROW_INVALID`, revalidated ones as `ROW_REVALIDATED`. */
  readonly ledger: RowLedger;
  readonly runId: string;
  /** Phases and retry flags of the session: decide `rowsToSend` / `rowsToProcess`. */
  readonly policy: RowActionPolicy;
  /** Key column of the rows (the one the factory uses): row key of invalid preset rows. */
  readonly rowKeyColumn?: string;
  /** Phases without `send` (RF-12): only `preset.iun` / `preset.notificationRequestId` are required. */
  readonly presetMode?: boolean;
  /**
   * Stop signal of the session: once aborted the pass stops before the next
   * row and returns the figures of the rows seen so far (incomplete).
   */
  readonly signal?: AbortSignal;
}
