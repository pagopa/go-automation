import type { ResultField } from '@go-automation/go-common/aws';
import type { ServiceLogSchema } from '../profiles/schemas/ServiceLogSchema.js';
import { extractCwField } from './extractCwField.js';

/** Matches a raw 32-hex-char X-Ray trace id (no `1-` prefix, no dashes). */
const RAW_TRACE_ID_PATTERN = /^[0-9a-fA-F]{32}$/;

/**
 * Matches the canonical X-Ray trace id format
 * `1-XXXXXXXX-YYYYYYYYYYYYYYYYYYYYYYYY` (prefix `1-`, dash after the
 * 8th char of the 32-hex body).
 */
const CANONICAL_TRACE_ID_PATTERN = /^1-[0-9a-fA-F]{8}-[0-9a-fA-F]{24}$/;

/**
 * Normalises a candidate trace id into the canonical X-Ray format
 * `1-XXXXXXXX-YYYYYYYYYYYYYYYYYYYYYYYY`.
 *
 * - Already canonical → returned unchanged.
 * - Raw 32-hex → transformed (prefix `1-`, dash after the 8th char).
 * - Anything else → `undefined`.
 *
 * @param input - Candidate trace id, raw or canonical.
 * @returns Canonical X-Ray trace id, or `undefined`.
 */
export function transformRawTraceId(input: string): string | undefined {
  if (CANONICAL_TRACE_ID_PATTERN.test(input)) {
    return input;
  }
  if (RAW_TRACE_ID_PATTERN.test(input)) {
    return `1-${input.slice(0, 8)}-${input.slice(8)}`;
  }
  return undefined;
}

/**
 * Outcome of {@link findTraceIdCandidate} when the scan yields a candidate.
 */
export interface TraceIdCandidateMatch {
  /** Raw token as it appeared in the log row (32 hex chars or canonical). */
  readonly raw: string;
  /** Canonical X-Ray form (`1-XXXXXXXX-…`). */
  readonly canonical: string;
}

/**
 * Scans CloudWatch Logs result rows for the first valid trace id field.
 *
 * Usato da `analyzeServiceLogs` per rilevare quando i log applicativi
 * portano un trace id dopo una query filtrata per `FALLBACK-UUID`. Il
 * valore è restituito anche quando coincide con il trace id corrente:
 * la prevenzione del loop è gestita dal passo `decide-*` successivo.
 *
 * @param results - CloudWatch Logs Insights result rows
 * @param schema - schema dei log applicativi (per il campo trace id)
 * @returns `{ raw, canonical }` del primo trace id valido, oppure `undefined`
 */
export function findTraceIdCandidate(
  results: ReadonlyArray<ResultField[]>,
  schema: ServiceLogSchema,
): TraceIdCandidateMatch | undefined {
  for (const row of results) {
    const primary = extractCwField(row, schema.traceIdField);
    const aliased = extractCwField(row, `@${schema.traceIdField}`);
    const raw = (primary ?? aliased ?? '').trim();
    if (raw === '' || raw === '-') continue;
    const canonical = transformRawTraceId(raw);
    if (canonical === undefined) continue;
    return { raw, canonical };
  }
  return undefined;
}
