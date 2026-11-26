/** A request id: letters, digits and dashes. */
const REQUEST_ID = /^[A-Za-z0-9-]{1,128}$/u;

/**
 * Whether a value is a request id that may enter a query predicate, a correlation or a gap of a read. Anything else
 * (free text, a value over the bound) is not one.
 *
 * @param value - Value read from a log
 * @returns `true` for a request id
 *
 * @example
 * ```typescript
 * isRequestId('a1b2-c3'); // true
 * isRequestId('req.42'); // false
 * ```
 */
export function isRequestId(value: string): boolean {
  return REQUEST_ID.test(value);
}
