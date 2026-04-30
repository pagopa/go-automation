import stringWidth from 'string-width';

/**
 * Returns the column-cell width of `s` in a fixed-width terminal,
 * accounting for Unicode wide characters (CJK, emoji), zero-width
 * characters, and ANSI escape sequences (which take 0 cells).
 *
 * Wraps `string-width` so that callers depend on a stable internal API
 * and we can swap the implementation later without touching call sites.
 */
export function displayWidth(s: string): number {
  return stringWidth(s);
}
