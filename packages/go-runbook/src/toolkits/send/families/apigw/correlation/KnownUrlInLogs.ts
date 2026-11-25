import type { KnownUrl } from '../../../../common/parsing/knownUrls/KnownUrl.js';

/**
 * Known URL match observed inside service logs.
 */
export interface KnownUrlInLogs {
  /** URL exactly as observed in the log message (already trimmed). */
  readonly observedUrl: string;
  /** Registry entry that matched the observed URL. */
  readonly known: KnownUrl;
}
