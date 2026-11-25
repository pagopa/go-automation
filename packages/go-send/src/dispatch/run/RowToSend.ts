import type { DispatchRecord } from '../model/DispatchRecord.js';
import type { RowState } from '../model/RowState.js';

/**
 * A row handed to the send stage, with its state from previous sessions.
 */
export interface RowToSend {
  readonly record: DispatchRecord;
  readonly previous?: RowState;
}
