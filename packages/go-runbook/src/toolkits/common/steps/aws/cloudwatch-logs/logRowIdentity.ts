import { readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { CloudWatchLogsRow } from './CloudWatchLogsRow.js';

/**
 * The identity of a log event of a CloudWatch Logs query, to merge two reads and to recognize a row already held:
 * its `@ptr` when the query returns it, otherwise every field and value of the row.
 *
 * @param row - A row of a query
 * @returns The identity of the event
 *
 * @example
 * ```typescript
 * logRowIdentity(row); // 'CmUKKwoo…'
 * ```
 */
export function logRowIdentity(row: unknown): string {
  if (!Array.isArray(row)) return String(row);
  const fields = row as CloudWatchLogsRow;
  const pointer = readRowField(fields, '@ptr');
  if (pointer !== undefined && pointer !== '') return pointer;
  return fields.map((field) => `${field.field ?? ''}=${field.value ?? ''}`).join('\u0001');
}
