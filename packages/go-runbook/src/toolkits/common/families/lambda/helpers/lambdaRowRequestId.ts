import { type GOLogsInsightsResultField, readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import { extractLambdaRequestId } from './extractLambdaRequestId.js';

/**
 * The request id of a Lambda log row: the structured `@requestId`, else the one the message names.
 *
 * @param row - Logs Insights row
 * @returns The request id, or nothing
 *
 * @example
 * ```typescript
 * lambdaRowRequestId([{ field: '@requestId', value: 'req-1' }]); // 'req-1'
 * ```
 */
export function lambdaRowRequestId(row: ReadonlyArray<GOLogsInsightsResultField>): string | undefined {
  const structured = (readRowField(row, '@requestId') ?? '').trim();
  if (structured !== '') return structured;
  return extractLambdaRequestId(readRowField(row, '@message') ?? '');
}
