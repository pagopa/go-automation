import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';
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
 * Outcome of {@link findFreshTraceId} when the scan yields a candidate.
 */
export interface FreshTraceIdMatch {
  /** Raw token as it appeared in the log row (32 hex chars). */
  readonly raw: string;
  /** Canonical X-Ray form (`1-XXXXXXXX-…`). */
  readonly canonical: string;
}

/**
 * Scans CloudWatch Logs result rows for the first valid `trace_id` field.
 *
 * Used by `analyzeServiceLogs` to detect when the application logs
 * carry an X-Ray trace id after a query filtered by `FALLBACK-UUID`.
 * The value is returned even when it resolves to the current trace id:
 * loop prevention is handled later by the decision step.
 *
 * @param results - CloudWatch Logs Insights result rows
 * @returns `{ raw, canonical }` of the first valid trace id, or `undefined`
 */
export function findFreshTraceId(results: ReadonlyArray<ResultField[]>): FreshTraceIdMatch | undefined {
  for (const row of results) {
    const raw = (extractCwField(row, 'trace_id') ?? extractCwField(row, '@trace_id') ?? '').trim();
    if (raw === '' || raw === '-') continue;
    const canonical = transformRawTraceId(raw);
    if (canonical === undefined) continue;
    return { raw, canonical };
  }
  return undefined;
}
