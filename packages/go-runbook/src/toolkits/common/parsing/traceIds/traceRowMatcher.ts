import { canonicalTraceId } from './canonicalTraceId.js';
import { messageTraceIds } from './messageTraceIds.js';
import type { TraceRowMatcherFn } from './TraceRowMatcherFn.js';

/**
 * The rule that tells whether a row belongs to one of some traces: the trace field decides when it has a value, the
 * message only when it has none, and then only a trace named as a whole token. Values are compared in canonical form.
 * The canonical forms of the traces are computed once.
 *
 * @param traceIds - Traces of the read, in any form
 * @returns The matcher
 *
 * @example
 * ```typescript
 * const belongs = traceRowMatcher(['1-6789abcd-0123456789abcdef01234567']);
 * belongs('6789ABCD0123456789ABCDEF01234567', ''); // true
 * ```
 */
export function traceRowMatcher(traceIds: ReadonlyArray<string>): TraceRowMatcherFn {
  const wanted = new Set(traceIds.map((traceId) => canonicalTraceId(traceId) ?? traceId.trim()));
  return (traceField, message) => {
    const field = traceField.trim();
    if (field !== '') return wanted.has(canonicalTraceId(field) ?? field);
    for (const traceId of messageTraceIds(message)) {
      if (wanted.has(traceId)) return true;
    }
    return false;
  };
}
