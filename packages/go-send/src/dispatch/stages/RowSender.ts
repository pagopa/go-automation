import type { DispatchRecord } from '../model/DispatchRecord.js';
import type { RowState } from '../model/RowState.js';

/**
 * Sends one row (B2B in `e2e`, pn-external-channels in `direct`). Never
 * throws for row-level problems.
 */
export interface RowSender {
  send(record: DispatchRecord, previous?: RowState): Promise<void>;
}
