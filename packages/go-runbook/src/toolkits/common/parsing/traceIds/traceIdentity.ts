import { readTraceparentTraceId } from './traceIdHeaders.js';
import { readXrayHeaderRoot } from './traceIdHeaders.js';
import { traceIdFormatOf } from './traceIdFormats.js';
import { TRACE_ID_FORMATS } from './traceIdFormats.js';

/**
 * The canonical form of a tracing id of any known format: a direct id (X-Ray, compact or W3C, `FALLBACK-UUID:<uuid>`,
 * `traceId:<uuid>`), otherwise the `Root=` of an X-Ray header or the trace id of a W3C `traceparent` header. The same
 * trace written in either form or case gives the same id.
 *
 * @param raw - Tracing id as found in a log
 * @returns The canonical id, or nothing when the value is not one
 *
 * @example
 * ```typescript
 * canonicalTraceId('Root=1-67891234-abcdef012345678912345678;Sampled=1'); // '1-67891234-abcdef012345678912345678'
 * ```
 */
export function canonicalTraceId(raw: string): string | undefined {
  const value = raw.trim();
  const header = readXrayHeaderRoot(value) ?? readTraceparentTraceId(value);
  return traceIdFormatOf(value)?.canonical ?? (header === undefined ? undefined : traceIdFormatOf(header)?.canonical);
}

/**
 * The forms a tracing id takes in the logs: the given value and the forms of its format (for an X-Ray id the canonical
 * and the compact 32-hex form).
 *
 * @param traceId - Tracing id in any accepted form
 * @returns The distinct forms, the given value first
 */
export function traceIdForms(traceId: string): ReadonlyArray<string> {
  const canonical = canonicalTraceId(traceId);
  const match = canonical === undefined ? undefined : traceIdFormatOf(canonical);
  if (match === undefined) return [traceId];
  return [...new Set([traceId, ...match.format.searchForms(match.canonical)])];
}

/**
 * The tracing ids a message names as whole tokens, of every known format, in canonical form.
 *
 * @param message - Log message
 * @returns The canonical tracing ids
 */
export function messageTraceIds(message: string): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const format of TRACE_ID_FORMATS) {
    for (const token of message.match(format.messageTokens) ?? []) {
      const canonical = canonicalTraceId(token);
      if (canonical !== undefined) ids.add(canonical);
    }
  }
  return ids;
}
