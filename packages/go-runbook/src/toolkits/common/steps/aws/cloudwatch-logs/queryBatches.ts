import type { StepCoverage } from '../../../../../engine/index.js';
import type { CloudWatchLogsReadAttempt } from './CloudWatchLogsReadAttempt.js';
import type { SaturatedBatchSplit } from './SaturatedBatchSplit.js';
import type { QueryOfBatchFn } from './QueryOfBatchFn.js';

/** The longest query `StartQuery` of CloudWatch Logs accepts, in characters. */
const MAX_QUERY_LENGTH = 10_000;

/**
 * Divides the items of a read into the batches to query: a batch takes items while its query stays within the length
 * `StartQuery` accepts, and at most `maxItems` when given. Every query scans the whole log group of the window, so
 * fewer batches scan less. An item whose query alone is too long is a batch of its own: `StartQuery` rejects it as
 * it would today.
 *
 * Complexity: O(N·L) over the items and the length of a query.
 *
 * @param items - The items of the read, in order
 * @param query - The query of a batch
 * @param maxItems - The most items of a batch, when the read caps it
 * @returns The batches, in the order of the items; none without items
 *
 * @example
 * ```typescript
 * queryBatches(traceIds, (batch) => renderQuery(batch)); // [[t1, …, t113]]
 * ```
 */
export function queryBatches<TItem>(
  items: ReadonlyArray<TItem>,
  query: QueryOfBatchFn<TItem>,
  maxItems?: number,
): ReadonlyArray<ReadonlyArray<TItem>> {
  const cap = maxItems === undefined ? Number.POSITIVE_INFINITY : Math.max(1, maxItems);
  const batches: TItem[][] = [];
  let current: TItem[] = [];
  for (const item of items) {
    const candidate = [...current, item];
    if (current.length > 0 && (candidate.length > cap || query(candidate).length > MAX_QUERY_LENGTH)) {
      batches.push(current);
      current = [item];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Reads a batch and, when its query is saturated, divides it in two and reads the halves, within the budget of the
 * execution (two re-reads per division), as long as a half stays saturated.
 *
 * - The rows of an item read completely are those of the halves; for an item still incomplete, the rows of the
 *   saturated read that belong to it are kept beside those of the halves, without duplicates; when the re-reads
 *   fail, the rows of the saturated read stay.
 * - The coverage names only the items still incomplete; the saturation of a divided read is replaced by that of its
 *   halves.
 * - The diagnostics of every query stay, the saturated one included.
 * - A failed first read is the only attempt, with its failure; a failed re-read is only its coverage.
 *
 * Complexity: O(R·B) over the rows and the items of a saturated batch, at each division.
 *
 * @param batch - The items of the batch
 * @param split - The query of a batch, the rules of the rows and the budget
 * @returns The attempts of the batch: the first read, or its diagnostics and those of the halves
 *
 * @example
 * ```typescript
 * const attempts = await readSplittingSaturated(traceIds, { read, belongs, rowIdentity, budget: context.readSplits });
 * ```
 */
export async function readSplittingSaturated<TItem>(
  batch: ReadonlyArray<TItem>,
  split: SaturatedBatchSplit<TItem>,
): Promise<ReadonlyArray<CloudWatchLogsReadAttempt>> {
  const attempt = await split.read(batch);
  const { budget, rowIdentity } = split;
  const divisible = attempt.failure === undefined && attempt.coverage.some(isSaturation) && batch.length > 1;
  if (!divisible || rowIdentity === undefined || budget === undefined || budget.remaining < 2) return [attempt];
  budget.remaining -= 2;
  const middle = Math.ceil(batch.length / 2);
  const attempts: CloudWatchLogsReadAttempt[] = [
    {
      rows: [],
      coverage: attempt.coverage.filter((entry) => !isSaturation(entry)),
      ...(attempt.diagnostics === undefined ? {} : { diagnostics: attempt.diagnostics }),
    },
  ];
  for (const half of [batch.slice(0, middle), batch.slice(middle)]) {
    const reads = await readSplittingSaturated(half, split);
    // A failed re-read is a gap of its items, never a failure of the batch.
    attempts.push(...reads.map(({ failure: _failure, ...read }) => read));
    if (reads.every((read) => read.failure === undefined && read.coverage.every((entry) => entry.complete))) continue;
    const seen = new Set(reads.flatMap((read) => read.rows.map(rowIdentity)));
    attempts.push({
      rows: attempt.rows.filter((row) => !seen.has(rowIdentity(row)) && half.some((item) => split.belongs(row, item))),
      coverage: [],
    });
  }
  return attempts;
}

function isSaturation(entry: StepCoverage): boolean {
  return !entry.complete && entry.reason === 'saturated';
}
