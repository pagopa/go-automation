/**
 * Regular expression helpers.
 */

/**
 * Whether a string compiles as a regular expression.
 *
 * @param pattern - Candidate regular expression source
 * @returns `true` when `new RegExp(pattern)` succeeds
 *
 * @example
 * ```typescript
 * isValidRegex('timeout|ECONNRESET'); // true
 * isValidRegex('[unclosed'); // false
 * ```
 */
export function isValidRegex(pattern: string): boolean {
  try {
    return Boolean(new RegExp(pattern));
  } catch {
    return false;
  }
}

/**
 * Compiles a regular expression, naming the pattern when it is invalid.
 * It keeps no cache: use {@link GORegexCache} to reuse compiled patterns.
 *
 * @param pattern - Regular expression source
 * @returns The compiled expression
 * @throws Error `Invalid regex pattern "<pattern>": <reason>`, with the original error as cause
 */
export function compileRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid regex pattern "${pattern}": ${message}`, { cause: err });
  }
}
