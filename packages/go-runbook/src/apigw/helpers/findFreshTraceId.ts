import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';
import { extractCwField } from './extractCwField.js';

/** Matches a raw 32-hex-char X-Ray trace id (no `1-` prefix, no dashes). */
const RAW_TRACE_ID_PATTERN = /^[0-9a-fA-F]{32}$/;

/**
 * Transforms a raw 32-hex-char trace id into the canonical X-Ray format
 * `1-XXXXXXXX-YYYYYYYYYYYYYYYYYYYYYYYY` (prefix `1-`, dash after the
 * 8th character).
 *
 * Returns `undefined` when the input does not look like a raw trace id.
 *
 * @param raw - Candidate trace id, e.g. `3d472be72977635208a92722b97b5e24`
 * @returns Canonical X-Ray trace id, or `undefined`
 */
export function transformRawTraceId(raw: string): string | undefined {
  if (!RAW_TRACE_ID_PATTERN.test(raw)) return undefined;
  return `1-${raw.slice(0, 8)}-${raw.slice(8)}`;
}

/**
 * Scans CloudWatch Logs result rows for the first `trace_id` field whose
 * value, once transformed via {@link transformRawTraceId}, is **not**
 * already in {@link knownIdentifiers}.
 *
 * Used by `analyzeServiceLogs` to detect when the application logs
 * carry an alternative X-Ray trace id (typically observed after a query
 * filtered by `FALLBACK-UUID`) that can be re-used as the next
 * `xRayTraceId`.
 *
 * @param results - CloudWatch Logs Insights result rows
 * @param knownIdentifiers - Identifiers already seen (raw or canonical)
 * @returns Canonical X-Ray trace id, or `undefined`
 */
export function findFreshTraceId(
  results: ReadonlyArray<ResultField[]>,
  knownIdentifiers: ReadonlySet<string>,
): string | undefined {
  for (const row of results) {
    const raw = (extractCwField(row, 'trace_id') ?? extractCwField(row, '@trace_id') ?? '').trim();
    if (raw === '' || raw === '-') continue;
    if (knownIdentifiers.has(raw)) continue;
    const transformed = transformRawTraceId(raw);
    if (transformed === undefined) continue;
    if (knownIdentifiers.has(transformed)) continue;
    return transformed;
  }
  return undefined;
}
