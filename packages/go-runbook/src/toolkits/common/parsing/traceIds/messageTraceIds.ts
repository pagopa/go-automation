import { canonicalTraceId } from './canonicalTraceId.js';

const XRAY_TRACE_IDS = /\b1-[0-9a-fA-F]{8}-[0-9a-fA-F]{24}\b/gu;
const RAW_TRACE_IDS = /\b[0-9a-fA-F]{32}\b/gu;

/**
 * The trace ids a message names as whole tokens, in canonical form.
 *
 * @param message - Log message
 * @returns The canonical trace ids
 */
export function messageTraceIds(message: string): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const token of [...(message.match(XRAY_TRACE_IDS) ?? []), ...(message.match(RAW_TRACE_IDS) ?? [])]) {
    const canonical = canonicalTraceId(token);
    if (canonical !== undefined) ids.add(canonical);
  }
  return ids;
}
