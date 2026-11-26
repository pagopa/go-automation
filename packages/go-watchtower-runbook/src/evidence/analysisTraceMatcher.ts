import { canonicalTraceId } from '@pagopa/go-runbook/toolkits/common';

import type { IdentifierMatcherFn } from './IdentifierMatcherFn.js';

/**
 * The rule that tells whether an identifier of a detected case refers to one of the trace ids of an analysis: the
 * same value in any case, for every identifier; for a trace id observation also the same canonical trace, when both
 * values are trace ids. A request id with the hex digits of a compact trace never matches its X-Ray form.
 *
 * @param traceIds - Trace ids of the analysis
 * @returns The matcher
 *
 * @example
 * ```typescript
 * const matches = analysisTraceMatcher(['6789abcd0123456789abcdef01234567']);
 * matches('1-6789abcd-0123456789abcdef01234567', true); // true
 * matches('1-6789abcd-0123456789abcdef01234567', false); // false
 * ```
 */
export function analysisTraceMatcher(traceIds: ReadonlyArray<string>): IdentifierMatcherFn {
  const literal = new Set(traceIds.map((id) => id.toLowerCase()));
  const canonical = new Set(traceIds.flatMap((id) => canonicalTraceId(id) ?? []));
  return (identifier, isTrace) => {
    if (literal.has(identifier.toLowerCase())) return true;
    if (!isTrace) return false;
    const trace = canonicalTraceId(identifier);
    return trace !== undefined && canonical.has(trace);
  };
}
