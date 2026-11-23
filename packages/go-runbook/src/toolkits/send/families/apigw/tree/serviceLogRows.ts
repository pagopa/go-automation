import { readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { EvidenceIdentifier } from '../../../../../engine/index.js';
import type { ServiceLogSchema } from '../../../../common/parsing/applicationLogs/ServiceLogSchema.js';
import { readServiceLogRow } from '../../../../common/parsing/applicationLogs/readServiceLogRow.js';
import { matchTraceIdCandidate } from '../../../../common/parsing/traceIds/matchTraceIdCandidate.js';
import { traceRowMatcher } from '../../../../common/parsing/traceIds/traceRows.js';
import type { ServiceRowMatcherFn } from './ServiceRowMatcherFn.js';
import { FALLBACK_UUID_GLOBAL_PATTERN } from '../correlation/extractFallbackUuid.js';
import type { CloudWatchLogsRow } from '../../../../common/steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';

/**
 * Whether a row of a grouped service read belongs to one of some identifiers, by the kind of each: a trace id on the
 * `trace_id` field, and on the message only when the row has no such field; a fallback UUID on the exact token of
 * the message. The trace id of a row read by fallback UUID does not decide. The trace ids are put in canonical form
 * once.
 *
 * @param identifiers - Identifiers of the read
 * @param schema - Schema of the service logs
 * @returns Whether a row belongs to one of the identifiers
 *
 * @example
 * ```typescript
 * serviceRowMatcher([{ kind: 'traceId', value: '1-6789abcd-0123456789abcdef01234567' }], schema)(row);
 * ```
 */
export function serviceRowMatcher(
  identifiers: ReadonlyArray<EvidenceIdentifier>,
  schema: ServiceLogSchema,
): ServiceRowMatcherFn {
  const uuids = new Set(identifiers.filter((id) => id.kind === 'fallbackUuid').map((id) => id.value));
  const traces = identifiers.filter((id) => id.kind !== 'fallbackUuid').map((id) => id.value);
  const belongsToTraces = traceRowMatcher(traces);
  return (row) => {
    if (!Array.isArray(row)) return false;
    const fields = row as CloudWatchLogsRow;
    const message = readRowField(fields, '@message') ?? readServiceLogRow(fields, schema).message;
    // The exact FALLBACK-UUID token of the message, never a substring of a longer value.
    if (
      uuids.size > 0 &&
      [...message.matchAll(FALLBACK_UUID_GLOBAL_PATTERN)].some((match) => uuids.has(match[1] ?? ''))
    ) {
      return true;
    }
    if (traces.length === 0) return false;
    const traceField =
      readRowField(fields, schema.traceIdField) ?? readRowField(fields, `@${schema.traceIdField}`) ?? '';
    return belongsToTraces(traceField, message);
  };
}

/**
 * The second attempt of a read by fallback UUID: the trace id the rows carry, to read the service again by trace.
 *
 * @param rows - Rows of the first read for the identifier
 * @param identifier - Identifier of the first read
 * @param schema - Schema of the service logs
 * @returns The trace id to read, or nothing
 */
export function traceIdOfFallbackRows(
  rows: ReadonlyArray<unknown>,
  identifier: EvidenceIdentifier,
  schema: ServiceLogSchema,
): EvidenceIdentifier | undefined {
  if (identifier.kind !== 'fallbackUuid') return undefined;
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const candidate = matchTraceIdCandidate(
      readServiceLogRow(row as CloudWatchLogsRow, schema).fields,
      schema,
      'field',
    );
    if (candidate !== undefined) return { kind: 'traceId', value: candidate.canonical };
  }
  return undefined;
}
