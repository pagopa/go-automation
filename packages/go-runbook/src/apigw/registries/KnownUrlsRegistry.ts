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
 * - `internal` entries must declare a non-empty `service`
 * - `external` entries must declare a non-empty `downstream`
 *
 * Use {@link getInternalServices} to perform consistency checks against
 * the list of microservices analyzed by the surrounding runbook.
 */
export class KnownUrlsRegistry {
  private readonly entries: ReadonlyArray<CompiledEntry>;
  private readonly internalServices: ReadonlySet<string>;

  constructor(urls: ReadonlyArray<KnownUrl>) {
    KnownUrlsRegistry.validate(urls);

    const compiled: CompiledEntry[] = [];
    const internals = new Set<string>();

    for (const known of urls) {
      compiled.push({ known, matcher: KnownUrlsRegistry.buildMatcher(known) });
      if (known.kind === 'internal') {
        internals.add(known.service);
      }
    }

    this.entries = compiled;
    this.internalServices = internals;
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
   * Returns the set of microservice names declared by internal entries.
   *
   * Used by {@link resolveKnownUrl} to detect drift between the URL
   * registry and the runbook's `services` array (see the
   * `<prefix>UrlNeedsRoutingFix` context variable).
   *
   * @returns Read-only set of service names
   */
  getInternalServices(): ReadonlySet<string> {
    return this.internalServices;
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
      if (u.kind === 'internal') {
        if (typeof u.service !== 'string' || u.service.trim() === '') {
          throw new Error(`KnownUrl internal '${u.url}' missing 'service'`);
        }
      } else if (u.kind === 'external') {
        if (typeof u.downstream !== 'string' || u.downstream.trim() === '') {
          throw new Error(`KnownUrl external '${u.url}' missing 'downstream'`);
        }
      } else {
        const _exhaustive: never = u;
        throw new Error(`Unknown KnownUrl.kind: ${JSON.stringify(_exhaustive)}`);
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
