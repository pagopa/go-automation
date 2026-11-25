import type { DispatchRecord } from '../model/DispatchRecord.js';

/**
 * Valid outcome of `buildRecord`.
 */
export interface RecordBuildSuccess {
  readonly ok: true;
  readonly record: DispatchRecord;
}
