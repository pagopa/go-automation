import { compileRegex } from '../../core/compileRegex.js';
import type { KnownUrl } from '../types/KnownUrl.js';
import type { KnownUrlMatch } from '../types/KnownUrlMatch.js';

/** Function shape used by {@link KnownUrlsRegistry} to test a candidate URL. */
type UrlMatcherFn = (url: string) => boolean;

interface CompiledEntry {
  readonly known: KnownUrl;
  readonly matcher: UrlMatcherFn;
}

/**
 * Immutable registry of known URLs.
 *
 * The registry pre-compiles each entry's matcher exactly once at
 * construction time. Lookups (`match`) are O(N) on the number of entries
 * (expected < 50 per runbook).
 *
 * The constructor enforces structural integrity:
 * - every entry must have a non-empty `url`
 * - every entry must declare a non-empty `target`
 *
 * The internal/external classification of a match is *not* a property of
 * the registry: callers compare {@link KnownUrl.target} against the
 * runbook's services to decide whether to loop into that service or
 * terminate as a downstream.
 */
export class KnownUrlsRegistry {
  private readonly entries: ReadonlyArray<CompiledEntry>;

  constructor(urls: ReadonlyArray<KnownUrl>) {
    KnownUrlsRegistry.validate(urls);

    const compiled: CompiledEntry[] = [];
    for (const known of urls) {
      compiled.push({ known, matcher: KnownUrlsRegistry.buildMatcher(known) });
    }

    this.entries = compiled;
  }

  /**
   * Returns the first known URL that matches the given observed URL.
   *
   * Entries are evaluated in declaration order; the first match wins.
   *
   * @param url - URL observed in a log message
   * @returns The matching entry, or `undefined` when no entry matches
   */
  match(url: string): KnownUrlMatch | undefined {
    for (const entry of this.entries) {
      if (entry.matcher(url)) {
        return { url, known: entry.known };
      }
    }
    return undefined;
  }

  /**
   * Returns all entries in declaration order (for trace and diagnostics).
   *
   * @returns Read-only array of registry entries
   */
  list(): ReadonlyArray<KnownUrl> {
    return this.entries.map((e) => e.known);
  }

  private static validate(urls: ReadonlyArray<KnownUrl>): void {
    for (const u of urls) {
      if (typeof u.url !== 'string' || u.url.trim() === '') {
        throw new Error("KnownUrl 'url' must be a non-empty string");
      }
      if (typeof u.target !== 'string' || u.target.trim() === '') {
        throw new Error(`KnownUrl '${u.url}' missing 'target'`);
      }
    }
  }

  private static buildMatcher(known: KnownUrl): UrlMatcherFn {
    const matchType = known.matchType ?? 'prefix';
    switch (matchType) {
      case 'exact':
        return (u) => u === known.url;
      case 'prefix':
        return (u) => u.startsWith(known.url);
      case 'regex': {
        const re = compileRegex(known.url);
        return (u) => re.test(u);
      }
      default: {
        const _exhaustive: never = matchType;
        throw new Error(`Unknown KnownUrl.matchType: ${String(_exhaustive)}`);
      }
    }
  }
}
