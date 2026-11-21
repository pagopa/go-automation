import type { ReadIdentifier } from '../../../../engine/types/ReadIdentifier.js';
import { canonicalTraceId } from './canonicalTraceId.js';
import type { TraceFieldReaderFn } from './TraceFieldReaderFn.js';

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
  identifiers: ReadonlyArray<ReadIdentifier>,
  traceField: TraceFieldReaderFn<T>,
): ReadonlyArray<T> {
  if (identifiers.some((identifier) => identifier.kind !== 'traceId')) return rows;
  const wanted = new Set(identifiers.map((identifier) => canonicalTraceId(identifier.value) ?? identifier.value));
  return rows.filter((row) => {
    const field = traceField(row).trim();
    return field === '' || wanted.has(canonicalTraceId(field) ?? field);
  });
}
