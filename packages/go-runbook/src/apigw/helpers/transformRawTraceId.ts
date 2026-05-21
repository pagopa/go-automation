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
