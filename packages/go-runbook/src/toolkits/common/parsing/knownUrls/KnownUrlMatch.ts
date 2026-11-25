import type { KnownUrl } from './KnownUrl.js';

/**
 * Output of {@link KnownUrlsRegistry.match}.
 *
 * Encapsulates both the original URL observed in the logs and the
 * matching registry entry so consumers can produce rich diagnostics
 * without re-running the lookup.
 */
export interface KnownUrlMatch {
  /** URL as observed in the log message */
  readonly url: string;
  /** Registry entry that matched the URL */
  readonly known: KnownUrl;
}
