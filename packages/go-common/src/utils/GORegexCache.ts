import { compileRegex } from './GORegexUtils.js';

/** Default number of compiled patterns kept by a {@link GORegexCache}. */
const DEFAULT_MAX_SIZE = 256;

/**
 * Bounded cache of compiled regular expressions, owned by whoever creates it.
 *
 * It avoids recompiling the same pattern in a hot loop without sharing state
 * across consumers: there is no module-level cache, each owner (for example a
 * runbook engine or a registry instance) creates its own. When full, the
 * oldest pattern is evicted.
 *
 * @example
 * ```typescript
 * const cache = new GORegexCache();
 * cache.compile('timeout').test('read timeout'); // true
 * ```
 */
export class GORegexCache {
  private readonly compiled = new Map<string, RegExp>();

  /**
   * @param maxSize - Maximum number of compiled patterns kept (default 256)
   */
  constructor(private readonly maxSize: number = DEFAULT_MAX_SIZE) {}

  /**
   * Returns the compiled expression for a pattern, compiling it the first time.
   *
   * @param pattern - Regular expression source
   * @returns The compiled expression
   * @throws Error naming the pattern when it is invalid (see `compileRegex`)
   */
  compile(pattern: string): RegExp {
    const cached = this.compiled.get(pattern);
    if (cached !== undefined) return cached;
    const regex = compileRegex(pattern);
    if (this.compiled.size >= this.maxSize) {
      const oldest = this.compiled.keys().next().value;
      if (oldest !== undefined) this.compiled.delete(oldest);
    }
    this.compiled.set(pattern, regex);
    return regex;
  }

  /** Number of compiled patterns currently kept. */
  get size(): number {
    return this.compiled.size;
  }
}
