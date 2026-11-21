import { type GOLogsInsightsResultField, readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { ReadIdentifier } from '../../../../../engine/types/ReadIdentifier.js';
import { traceRowMatcher } from '../../../parsing/traceIds/traceRowMatcher.js';

/**
 * Whether a row of a grouped trace read belongs to a trace id: on the `trace_id` field, on the message only when the
 * row has no such field.
 *
 * @param row - Logs Insights row
 * @param identifier - Trace id of the read
 * @returns `true` when the row is the trace id's
 */
export function attributeTraceRow(row: unknown, identifier: ReadIdentifier): boolean {
  if (!Array.isArray(row)) return false;
  const fields = row as ReadonlyArray<GOLogsInsightsResultField>;
  return traceRowMatcher([identifier.value])(
    readRowField(fields, 'trace_id') ?? '',
    readRowField(fields, '@message') ?? '',
  );
}
