import { lambdaRowRequestId } from './lambdaRowRequestId.js';
import type { CloudWatchLogsRows } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';

/**
 * The rows of a batch of invocations: a row of another invocation that only quotes a request id of the batch is dropped,
 * so a row read by two batches is kept once.
 *
 * @param rows - Rows of the batch query
 * @param requestIds - Request ids of the batch
 * @returns The rows of the invocations of the batch
 */
export function rowsOfInvocations(rows: CloudWatchLogsRows, requestIds: ReadonlyArray<string>): CloudWatchLogsRows {
  const wanted = new Set(requestIds);
  return rows.filter((row) => wanted.has(lambdaRowRequestId(row) ?? ''));
}
