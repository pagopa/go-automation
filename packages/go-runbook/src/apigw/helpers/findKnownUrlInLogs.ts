import type { ResultField } from '@go-automation/go-common/aws';
import type { ServiceLogSchema } from '../profiles/schemas/ServiceLogSchema.js';
import { readMessageField } from './readMessageField.js';
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
 * Complessità: O(N · M) dove N è il numero di righe e M il numero di URL
 * per messaggio. Il registry lookup è O(K) sul numero di entry
 * (tipicamente < 50).
 *
 * @param results - CloudWatch Logs Insights result rows
 * @param registry - Registry of known URLs
 * @param schema - schema dei log applicativi (per il campo message)
 * @returns The first known URL found, or `undefined`
 */
export function findKnownUrlInLogs(
  results: ReadonlyArray<ResultField[]>,
  registry: KnownUrlsRegistry,
  schema: ServiceLogSchema,
): KnownUrlInLogs | undefined {
  for (const row of results) {
    const message = readMessageField(row, schema);
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
