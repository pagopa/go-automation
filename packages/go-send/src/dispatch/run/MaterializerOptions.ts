import type { InputFormat } from '../input/InputFormat.js';
import type { InputReader } from '../input/InputReader.js';
import type { RowLedger } from '../journal/RowLedger.js';
import type { MappingOutputColumns } from '../mapping/MappingOutputColumns.js';

/**
 * Options of {@link ./materializeRun.materializeRun}.
 */
export interface MaterializerOptions {
  readonly reader: InputReader;
  readonly ledger: RowLedger;
  readonly format: InputFormat;
  /** CSV delimiter of the output (default: the input one). */
  readonly delimiter?: string;
  readonly outputPath: string;
  readonly reportPath: string;
  readonly outputColumns?: MappingOutputColumns;
  /** Key column, to show the row key of rows never journaled (dry run, not sent). */
  readonly rowKeyColumn?: string;
  /** Add `_status`, `_notificationRequestId`, `_error` to the output. */
  readonly includeStatus: boolean;
  /** Only rows SEND (or pn-ec) accepted in the output: never refused, failed or timed out ones. */
  readonly onlySuccess: boolean;
  /** Status shown for valid rows never sent: `DRY_RUN` in a dry run, else `PENDING`. */
  readonly unsentStatus: 'DRY_RUN' | 'PENDING';
}
