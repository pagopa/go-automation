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
const MAX_REGEX_CACHE_SIZE = 256;
const regexCache = new Map<string, RegExp>();

export function compileRegex(pattern: string): RegExp {
  const cached = regexCache.get(pattern);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const compiled = new RegExp(pattern);
    if (regexCache.size >= MAX_REGEX_CACHE_SIZE) {
      const firstKey = regexCache.keys().next().value;
      if (firstKey !== undefined) {
        regexCache.delete(firstKey);
      }
    }
    regexCache.set(pattern, compiled);
    return compiled;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid regex pattern "${pattern}": ${message}`, { cause: err });
  }
}
