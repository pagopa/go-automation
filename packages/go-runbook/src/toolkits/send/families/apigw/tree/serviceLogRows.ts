import { type GOLogsInsightsResultField, readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { TreeReadIdentifier } from '../../../../../engine/types/TreeReadIdentifier.js';
import type { ServiceLogSchema } from '../../../../common/parsing/applicationLogs/ServiceLogSchema.js';
import { readServiceLogRow } from '../../../../common/parsing/applicationLogs/readServiceLogRow.js';
import { matchTraceIdCandidate } from '../../../../common/parsing/applicationLogs/matchTraceIdCandidate.js';
import { canonicalTraceId } from '../../../../common/parsing/traceIds/canonicalTraceId.js';
import { messageTraceIds } from '../../../../common/parsing/traceIds/messageTraceIds.js';
import { FALLBACK_UUID_GLOBAL_PATTERN } from '../correlation/extractFallbackUuid.js';

type Row = ReadonlyArray<GOLogsInsightsResultField>;

/**
 * Whether a row of a grouped service read belongs to an identifier, by the kind of the read: a trace id on the
 * `trace_id` field, and on the message only when the row has no such field; a fallback UUID on the exact token of
 * the message. The trace id of a row read by fallback UUID does not decide.
 *
 * @param row - Logs Insights row
 * @param identifier - Identifier of the read
 * @param schema - Schema of the service logs
 * @returns `true` when the row is the identifier's
 *
 * @example
 * ```typescript
 * attributeServiceRow(row, { kind: 'traceId', value: '1-6789abcd-0123456789abcdef01234567' }, schema);
 * ```
 */
export function attributeServiceRow(row: unknown, identifier: TreeReadIdentifier, schema: ServiceLogSchema): boolean {
  if (!Array.isArray(row)) return false;
  const fields = row as Row;
  const message = readRowField(fields, '@message') ?? readServiceLogRow(fields, schema).message;
  if (identifier.kind === 'fallbackUuid') {
    // The exact FALLBACK-UUID token of the message, never a substring of a longer value.
    return [...message.matchAll(FALLBACK_UUID_GLOBAL_PATTERN)].some((match) => match[1] === identifier.value);
  }
  const wanted = canonicalTraceId(identifier.value) ?? identifier.value;
  const traceField = (
    readRowField(fields, schema.traceIdField) ??
    readRowField(fields, `@${schema.traceIdField}`) ??
    ''
  ).trim();
  if (traceField === '') return messageTraceIds(message).has(wanted);
  return (canonicalTraceId(traceField) ?? traceField) === wanted;
}

/**
 * The identity of a service row, to merge two reads and to recognize a row an ancestor holds: its `@ptr` when the
 * query projects it, otherwise every field of the row.
 *
 * @param row - Logs Insights row
 * @returns The identity
 */
export function serviceRowIdentity(row: unknown): string {
  if (!Array.isArray(row)) return String(row);
  const fields = row as Row;
  const pointer = readRowField(fields, '@ptr');
  if (pointer !== undefined && pointer !== '') return pointer;
  return fields.map((field) => `${field.field ?? ''}=${field.value ?? ''}`).join('\u0001');
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
  identifier: TreeReadIdentifier,
  schema: ServiceLogSchema,
): TreeReadIdentifier | undefined {
  if (identifier.kind !== 'fallbackUuid') return undefined;
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const candidate = matchTraceIdCandidate(readServiceLogRow(row as Row, schema).fields, schema, 'field');
    if (candidate !== undefined) return { kind: 'traceId', value: candidate.canonical };
  }
  return undefined;
}
