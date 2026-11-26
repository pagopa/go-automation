import { LAMBDA_REQUEST_ID } from './lambdaRequestIdFilter.js';
import { lambdaRowRequestId } from './lambdaRowRequestId.js';
import type { CloudWatchLogsRows } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';

/**
 * The request ids of some Lambda log rows that may enter an invocation query, each once, in the order of the rows. A
 * row without a usable request id is an invocation of its own and is never reconstructed.
 *
 * @param rows - Logs Insights rows
 * @returns The distinct request ids
 *
 * @example
 * ```typescript
 * requestIdsOf([[{ field: '@requestId', value: 'req-1' }], [{ field: '@requestId', value: 'req-1' }]]); // ['req-1']
 * ```
 */
export function requestIdsOf(rows: CloudWatchLogsRows): ReadonlyArray<string> {
  const requestIds = new Set<string>();
  for (const row of rows) {
    const requestId = lambdaRowRequestId(row);
    if (requestId !== undefined && LAMBDA_REQUEST_ID.test(requestId)) requestIds.add(requestId);
  }
  return [...requestIds];
}
