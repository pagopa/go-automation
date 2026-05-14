import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';
import { extractCwField } from './extractCwField.js';
import type { KnownUrlsRegistry } from '../registries/KnownUrlsRegistry.js';
import type { KnownUrl } from '../types/KnownUrl.js';

/**
 * Pattern that extracts candidate URLs from a log message body.
 *
 * Captures `http://...` / `https://...` tokens up to the first
 * whitespace, quote, angle-bracket or backtick. The trailing punctuation
 * commonly attached to a URL in prose (e.g. trailing `.`, `,`, `;`, `:`,
 * `)`, `]`) is trimmed by the consumer to avoid false negatives during
 * registry matching.
 */
const URL_PATTERN = /https?:\/\/[^\s'"<>`]+/g;

/** Trailing characters trimmed before attempting a registry match. */
const TRAILING_TRIM = /[).,;:\]]+$/;

/**
 * Outcome of {@link findKnownUrlInLogs} when the scan yields a match.
 */
export interface KnownUrlInLogs {
  /** URL exactly as observed in the log message (already trimmed). */
  readonly observedUrl: string;
  /** Registry entry that matched the observed URL. */
  readonly known: KnownUrl;
}

/**
 * Scans CloudWatch Logs result rows for the first URL that matches an
 * entry in the supplied {@link KnownUrlsRegistry}.
 *
 * Rows are scanned in order; for each row the function extracts every
 * `http(s)://` token, trims trailing punctuation and probes the registry.
 * The first match wins.
 *
 * Complexity: O(N · M) where N is the number of rows and M the number of
 * URLs per message. The registry lookup itself is O(K) on the number of
 * entries (typically < 50).
 *
 * @param results - CloudWatch Logs Insights result rows
 * @param registry - Registry of known URLs
 * @returns The first known URL found, or `undefined`
 */
export function findKnownUrlInLogs(
  results: ReadonlyArray<ResultField[]>,
  registry: KnownUrlsRegistry,
): KnownUrlInLogs | undefined {
  for (const row of results) {
    const message = extractCwField(row, 'message') ?? extractCwField(row, '@message') ?? '';
    if (message === '') {
      continue;
    }

    const urls = message.match(URL_PATTERN);
    if (urls === null) {
      continue;
    }

    for (const raw of urls) {
      const trimmed = raw.replace(TRAILING_TRIM, '');
      if (trimmed === '') {
        continue;
      }
      const match = registry.match(trimmed);
      if (match !== undefined) {
        return { observedUrl: trimmed, known: match.known };
      }
    }
  }

  return undefined;
}
