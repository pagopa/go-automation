/**
 * Returns a shallow copy of `record` with all `undefined` properties removed.
 *
 * Designed to replace the `...(x !== undefined ? { x } : {})` spread chain
 * that {@link https://www.typescriptlang.org/tsconfig#exactOptionalPropertyTypes
 * `exactOptionalPropertyTypes: true`} forces on call sites with optional
 * fields. Use it when you have **three or more** optional fields to assemble
 * at once — for one-off cases the inline spread is still clearer.
 *
 * @example
 * ```typescript
 * // Before:
 * return {
 *   name: x.name,
 *   ...(x.status !== undefined ? { status: x.status } : {}),
 *   ...(x.latency !== undefined ? { latency: x.latency } : {}),
 *   ...(x.requestId !== undefined ? { requestId: x.requestId } : {}),
 * };
 *
 * // After:
 * return {
 *   name: x.name,
 *   ...omitUndefined({ status: x.status, latency: x.latency, requestId: x.requestId }),
 * };
 * ```
 */
export function omitUndefined<T extends Record<string, unknown>>(
  record: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const out: { [K in keyof T]?: Exclude<T[K], undefined> } = {};
  for (const key of Object.keys(record) as ReadonlyArray<keyof T>) {
    const value = record[key];
    if (value !== undefined) {
      out[key] = value as Exclude<T[typeof key], undefined>;
    }
  }
  return out;
}
