import type { ReadSplitBudget } from '../../../../../engine/index.js';
import type { CloudWatchLogsReadAttempt } from './CloudWatchLogsReadAttempt.js';
import type { CloudWatchLogsRow } from './CloudWatchLogsRow.js';
import type { LogRowIdentityFn } from './LogRowIdentityFn.js';

/**
 * How a read divides a saturated batch: one query per batch, the rule that tells the item of a row and the identity
 * of a row, and the budget of the execution. Without the identity or the budget a saturated batch is not divided.
 */
export interface SaturatedBatchSplit<TItem> {
  readonly budget?: ReadSplitBudget;
  read(batch: ReadonlyArray<TItem>): Promise<CloudWatchLogsReadAttempt>;
  belongs(row: CloudWatchLogsRow, item: TItem): boolean;
  readonly rowIdentity?: LogRowIdentityFn;
}
