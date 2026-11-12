import type { RecordBuildResult } from './RecordBuildResult.js';

/**
 * A row turned into a record (or into validation issues).
 */
export interface CreatedRecord {
  readonly rowIndex: number;
  readonly rowKey: string;
  readonly result: RecordBuildResult;
}
