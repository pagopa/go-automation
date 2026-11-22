import { readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { EvidenceIdentifier, TreeRowPredicate } from '../../../../../engine/index.js';
import { traceRowMatcher } from '../../../parsing/traceIds/traceRows.js';
import type { CloudWatchLogsRow } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';

/**
 * The test of the rows of a grouped trace read that belong to a trace id: on the `trace_id` field, on the message
 * only when the row has no such field. The trace id is put in canonical form once.
 *
 * @param identifier - Trace id of the read
 * @returns Whether a row is the trace id's
 *
 * @example
 * ```typescript
 * const rows = read.rows.filter(attributeTraceRow({ kind: 'traceId', value: traceId }));
 * ```
 */
export function attributeTraceRow(identifier: EvidenceIdentifier): TreeRowPredicate {
  const belongs = traceRowMatcher([identifier.value]);
  return (row) => {
    if (!Array.isArray(row)) return false;
    const fields = row as CloudWatchLogsRow;
    return belongs(readRowField(fields, 'trace_id') ?? '', readRowField(fields, '@message') ?? '');
  };
}
