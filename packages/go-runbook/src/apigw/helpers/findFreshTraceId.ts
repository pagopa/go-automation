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
 * Scans CloudWatch Logs result rows for the first `trace_id` field whose
 * value, once transformed via {@link transformRawTraceId}, is **not**
 * already in {@link knownIdentifiers}.
 *
 * Used by `analyzeServiceLogs` to detect when the application logs
 * carry an alternative X-Ray trace id (typically observed after a query
 * filtered by `FALLBACK-UUID`) that can be re-used as the next
 * `xRayTraceId`. Returns both the raw token (so callers can show what
 * was observed) and the canonical form (so callers can install it as
 * the new `xRayTraceId`).
 *
 * @param results - CloudWatch Logs Insights result rows
 * @param knownIdentifiers - Identifiers already seen (raw or canonical)
 * @returns `{ raw, canonical }` of the first fresh trace id, or `undefined`
 */
export function findFreshTraceId(
  results: ReadonlyArray<ResultField[]>,
  knownIdentifiers: ReadonlySet<string>,
): FreshTraceIdMatch | undefined {
  for (const row of results) {
    const raw = (extractCwField(row, 'trace_id') ?? extractCwField(row, '@trace_id') ?? '').trim();
    if (raw === '' || raw === '-') continue;
    if (knownIdentifiers.has(raw)) continue;
    const canonical = transformRawTraceId(raw);
    if (canonical === undefined) continue;
    if (knownIdentifiers.has(canonical)) continue;
    return { raw, canonical };
  }
  return undefined;
}
