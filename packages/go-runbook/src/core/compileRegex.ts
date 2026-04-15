/**
 * Safely compiles a regex pattern string into a RegExp object.
 *
 * Provides a descriptive error message when the pattern is invalid,
 * preserving the original error as `cause`.
 *
 * @param pattern - The regex pattern string to compile
 * @returns The compiled RegExp
 * @throws Error if the pattern is invalid
 */
export function compileRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid regex pattern "${pattern}": ${message}`, { cause: err });
  }
}
