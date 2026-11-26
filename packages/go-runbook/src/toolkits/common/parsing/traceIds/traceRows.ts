import { canonicalTraceId } from './traceIdentity.js';
import { messageTraceIds } from './traceIdentity.js';
import type { TraceRowMatcherFn } from './TraceRowMatcherFn.js';
import type { EvidenceIdentifier } from '../../../../engine/index.js';
import type { TraceFieldReaderFn } from './TraceFieldReaderFn.js';

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

/**
 * The rows of a read by trace id that belong to the requested traces: a row whose structured trace field names another
 * trace is dropped, even when its message quotes a requested one. Rows without the field are kept. A read by another
 * kind of identifier is returned as is.
 *
 * @param rows - Rows of the read
 * @param identifiers - Identifiers of the read
 * @param traceField - The structured trace field of a row, empty when absent
 * @returns The rows of the requested traces
 */
export function rowsOfTraces<T>(
  rows: ReadonlyArray<T>,
  identifiers: ReadonlyArray<EvidenceIdentifier>,
  traceField: TraceFieldReaderFn<T>,
): ReadonlyArray<T> {
  if (identifiers.some((identifier) => identifier.kind !== 'traceId')) return rows;
  const wanted = new Set(identifiers.map((identifier) => canonicalTraceId(identifier.value) ?? identifier.value));
  return rows.filter((row) => {
    const field = traceField(row).trim();
    return field === '' || wanted.has(canonicalTraceId(field) ?? field);
  });
}
