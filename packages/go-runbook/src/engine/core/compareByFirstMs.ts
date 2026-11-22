/**
 * Orders two entries by their earliest time: earliest first, untimed last, `0` on ties so that the caller decides.
 *
 * @param a - First entry
 * @param b - Second entry
 * @returns A negative number when `a` comes first, a positive one when `b` does, `0` on ties
 *
 * @example
 * ```typescript
 * matches.sort((a, b) => compareByFirstMs(a, b) || a.declarationIndex - b.declarationIndex);
 * ```
 */
export function compareByFirstMs(
  a: { readonly firstMs?: number | undefined },
  b: { readonly firstMs?: number | undefined },
): number {
  if (a.firstMs !== undefined && b.firstMs !== undefined) return a.firstMs - b.firstMs;
  if (a.firstMs !== undefined) return -1;
  if (b.firstMs !== undefined) return 1;
  return 0;
}
