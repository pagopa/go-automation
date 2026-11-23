import type { StepCoverage, StepDiagnostics } from '../../../../../engine/index.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { CloudWatchLogsBatchedRead } from './CloudWatchLogsBatchedRead.js';
import type { CloudWatchLogsBatchedReadResult } from './CloudWatchLogsBatchedReadResult.js';
import { mergeCloudWatchLogsDiagnostics } from './mergeCloudWatchLogsDiagnostics.js';
import { tryCloudWatchLogsRead } from './tryCloudWatchLogsRead.js';
import type { CloudWatchLogsRow } from './CloudWatchLogsRow.js';
import { queryBatches, readSplittingSaturated } from './queryBatches.js';

/**
 * Reads many items with a Logs Insights query per batch of items, in order, and merges what the batches read.
 *
 * - A cancellation of the execution and a configuration error of the target are thrown at once.
 * - Any other failed batch keeps the rows of the others: it becomes an `unavailable` coverage entry that names the
 *   identifiers of its items, and its error is returned in `failures`.
 * - The gaps of a batch that answered (a saturated query, unread pages) name the identifiers of its items too.
 * - When no batch answered, the error of the first failure is thrown: nothing was read.
 *
 * Complexity: one query per `batchSize` items.
 *
 * @param context - Context of the step
 * @param read - Items, batch size, query of a batch, identifier of an item and the rows a batch keeps
 * @returns The rows, coverage and diagnostics of the batches that answered, with the errors of those that failed
 * @throws Error when no batch answered, on cancellation and on a configuration error of the target
 *
 * @example
 * ```typescript
 * const read = await readCloudWatchLogsBatches(context, {
 *   logGroups: [logGroup],
 *   timeRange,
 *   options: {},
 *   items: requestIds,
 *   batchSize: 25,
 *   query: (batch) => invocationQuery(batch),
 *   identifier: (requestId) => ({ kind: 'requestId', value: requestId }),
 * });
 * ```
 */
export async function readCloudWatchLogsBatches<TItem>(
  context: OperationalContext,
  read: CloudWatchLogsBatchedRead<TItem>,
): Promise<CloudWatchLogsBatchedReadResult> {
  const batches = queryBatches(read.items, (batch) => read.query(batch), read.batchSize);
  const rows: CloudWatchLogsRow[] = [];
  const coverage: StepCoverage[] = [];
  const diagnostics: (StepDiagnostics | undefined)[] = [];
  const failures: Error[] = [];
  for (const batch of batches) {
    const attempts = await readSplittingSaturated(batch, {
      read: async (items) =>
        tryCloudWatchLogsRead(context, {
          logGroups: read.logGroups,
          query: read.query(items),
          timeRange: read.timeRange,
          options: read.options,
          identifiers: items.map((item) => read.identifier(item)),
          ...(read.source === undefined ? {} : { source: read.source }),
        }),
      belongs: (row, item) => read.belongs?.(row, item) ?? false,
      // A read that tells the item and the identity of a row divides a saturated batch.
      ...(read.belongs !== undefined && read.rowIdentity !== undefined && context.readSplits !== undefined
        ? { rowIdentity: (row: CloudWatchLogsRow) => read.rowIdentity?.(row) ?? '', budget: context.readSplits }
        : {}),
    });
    for (const attempt of attempts) coverage.push(...attempt.coverage);
    // A divided read never fails as a whole: only a first read that failed has a failure.
    const failure = attempts[0]?.failure;
    if (failure !== undefined) {
      failures.push(failure);
      continue;
    }
    for (const attempt of attempts) diagnostics.push(attempt.diagnostics);
    // The rows of the batch once, after the division: a caller that collects results per item collects them once.
    const batchRows = attempts.flatMap((attempt) => attempt.rows);
    for (const row of read.rowsOf === undefined ? batchRows : read.rowsOf(batchRows, batch)) rows.push(row);
  }
  const firstFailure = failures[0];
  if (firstFailure !== undefined && failures.length === batches.length) throw firstFailure;
  const merged = mergeCloudWatchLogsDiagnostics(diagnostics);
  return { rows, coverage, failures, ...(merged === undefined ? {} : { diagnostics: merged }) };
}
