import { type GOLogsInsightsResultField, readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { ReadIdentifier } from '../../../../../engine/types/ReadIdentifier.js';
import { canonicalTraceId } from '../../../parsing/traceIds/canonicalTraceId.js';
import { messageTraceIds } from '../../../parsing/traceIds/messageTraceIds.js';

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
  const field = (readRowField(fields, 'trace_id') ?? '').trim();
  const wanted = canonicalTraceId(identifier.value) ?? identifier.value;
  if (field === '') return messageTraceIds(readRowField(fields, '@message') ?? '').has(wanted);
  return (canonicalTraceId(field) ?? field) === wanted;
}
