import type { StepCoverage, StepDiagnostics } from '../../../../../engine/index.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { CloudWatchLogsBatchedRead } from './CloudWatchLogsBatchedRead.js';
import type { CloudWatchLogsBatchedReadResult } from './CloudWatchLogsBatchedReadResult.js';
import { mergeCloudWatchLogsDiagnostics } from './mergeCloudWatchLogsDiagnostics.js';
import { tryCloudWatchLogsRead } from './tryCloudWatchLogsRead.js';
import type { CloudWatchLogsRow } from './CloudWatchLogsRow.js';

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
  const size = Math.max(1, read.batchSize);
  const rows: CloudWatchLogsRow[] = [];
  const coverage: StepCoverage[] = [];
  const diagnostics: (StepDiagnostics | undefined)[] = [];
  const failures: Error[] = [];
  for (let start = 0; start < read.items.length; start += size) {
    const batch = read.items.slice(start, start + size);
    const attempt = await tryCloudWatchLogsRead(context, {
      logGroups: read.logGroups,
      query: read.query(batch),
      timeRange: read.timeRange,
      options: read.options,
      identifiers: batch.map((item) => read.identifier(item)),
      ...(read.source === undefined ? {} : { source: read.source }),
    });
    coverage.push(...attempt.coverage);
    if (attempt.failure !== undefined) {
      failures.push(attempt.failure);
      continue;
    }
    rows.push(...(read.rowsOf === undefined ? attempt.rows : read.rowsOf(attempt.rows, batch)));
    diagnostics.push(attempt.diagnostics);
  }
  const firstFailure = failures[0];
  if (firstFailure !== undefined && failures.length === Math.ceil(read.items.length / size)) throw firstFailure;
  const merged = mergeCloudWatchLogsDiagnostics(diagnostics);
  return { rows, coverage, failures, ...(merged === undefined ? {} : { diagnostics: merged }) };
}
