import { canonicalTraceId } from './canonicalTraceId.js';

/**
 * The forms a trace id takes in the logs: the canonical X-Ray form and the compact 32-hex form of the same id.
 *
 * @param traceId - Trace id in any accepted form
 * @returns The distinct forms, the given value first
 */
export function traceIdForms(traceId: string): ReadonlyArray<string> {
  const canonical = canonicalTraceId(traceId);
  if (canonical === undefined) return [traceId];
  return [...new Set([traceId, canonical, canonical.slice(2).replaceAll('-', '')])];
}
