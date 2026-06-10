import type { ResultField } from '@go-automation/go-common/aws';

import type { ServiceLogSchema } from '../types/ServiceLogSchema.js';

const ERROR_KEYWORDS: ReadonlyArray<string> = [
  'Exception',
  'Error',
  'failed',
  'FAILURE',
  'Status: timeout',
  'Status: error',
];

const FALLBACK_UUID_PATTERN =
  /FALLBACK-UUID:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

const XRAY_TRACE_ID_PATTERN = /\b1-[0-9a-fA-F]{8}-[0-9a-fA-F]{24}\b/;

/**
 * A 32-hex trace id embedded in the message text, **only when explicitly
 * labeled** (e.g. `"trace_id":"<hex>"`, `traceId=<hex>`, `trace-id: <hex>`).
 *
 * Requiring the label avoids treating any bare 32-hex token (MD5, dash-less
 * UUID, request hash) found in a log line as a trace id, which would trigger a
 * trace query on a non-existent identifier.
 */
const LABELED_TRACE_ID_PATTERN = /trace[_-]?id["'\s:=]+([0-9a-fA-F]{32})(?![0-9a-fA-F])/i;

export interface TraceIdCandidateMatch {
  readonly raw: string;
  readonly canonical: string;
}

export interface ApplicationLogsScan {
  readonly errorMessage: string;
  readonly fallbackUuid: string | undefined;
  readonly traceIdCandidate: TraceIdCandidateMatch | undefined;
}

export function scanApplicationLogs(
  results: ReadonlyArray<ReadonlyArray<ResultField>>,
  schema: ServiceLogSchema,
): ApplicationLogsScan {
  let bestByLevel = '';
  let bestByKeyword = '';
  let fallbackUuid: string | undefined;
  let traceIdCandidate: TraceIdCandidateMatch | undefined;

  for (const row of results) {
    const fields = new Map<string, string>();
    for (const field of row) {
      if (field.field !== undefined && field.value !== undefined && !fields.has(field.field)) {
        fields.set(field.field, field.value);
      }
    }

    const message = readMessage(fields, schema);
    const level = (fields.get(schema.levelField) ?? '').toLowerCase();
    const isErrorLevel = level.includes('error') || level.includes('warn');

    if (message !== '') {
      if (isErrorLevel && message.length > bestByLevel.length) {
        bestByLevel = message;
      }

      if ((level === '' || isErrorLevel) && message.length > bestByKeyword.length) {
        if (ERROR_KEYWORDS.some((keyword) => message.includes(keyword))) {
          bestByKeyword = message;
        }
      }

      if (fallbackUuid === undefined) {
        const match = FALLBACK_UUID_PATTERN.exec(message);
        if (match?.[1] !== undefined) {
          fallbackUuid = match[1];
        }
      }
    }

    traceIdCandidate ??= matchTraceIdCandidate(fields, schema, message);
  }

  return {
    errorMessage: bestByLevel !== '' ? bestByLevel : bestByKeyword,
    fallbackUuid,
    traceIdCandidate,
  };
}

function readMessage(fields: ReadonlyMap<string, string>, schema: ServiceLogSchema): string {
  for (const candidate of schema.messageFieldCandidates) {
    const value = fields.get(candidate);
    if (value !== undefined) return value;
  }
  return '';
}

function matchTraceIdCandidate(
  fields: ReadonlyMap<string, string>,
  schema: ServiceLogSchema,
  message: string,
): TraceIdCandidateMatch | undefined {
  const primary = fields.get(schema.traceIdField);
  const aliased = fields.get(`@${schema.traceIdField}`);
  const rawFromField = (primary ?? aliased ?? '').trim();
  const fromField = canonicalTraceId(rawFromField);
  if (fromField !== undefined) {
    return { raw: rawFromField, canonical: fromField };
  }

  const xray = XRAY_TRACE_ID_PATTERN.exec(message)?.[0];
  if (xray !== undefined) {
    return { raw: xray, canonical: xray };
  }

  const labeled = LABELED_TRACE_ID_PATTERN.exec(message)?.[1];
  const fromMessage = labeled === undefined ? undefined : canonicalTraceId(labeled);
  return labeled !== undefined && fromMessage !== undefined ? { raw: labeled, canonical: fromMessage } : undefined;
}

function canonicalTraceId(raw: string): string | undefined {
  if (raw === '' || raw === '-') return undefined;
  if (/^1-[0-9a-fA-F]{8}-[0-9a-fA-F]{24}$/.test(raw)) {
    return raw;
  }
  if (/^[0-9a-fA-F]{32}$/.test(raw)) {
    return `1-${raw.slice(0, 8)}-${raw.slice(8)}`;
  }
  return undefined;
}
