import type { GORetryClassifier } from '../GORetryClassifier.js';
import type { GORetryDecision } from '../GORetryDecision.js';

/**
 * Creates a classifier that decides based on the HTTP status code attached
 * to the error.
 *
 * The error must expose a numeric `statusCode` property (Node `fetch` errors
 * and most HTTP client libraries do; otherwise wrap them upstream).
 *
 * Behaviour:
 * - status in `retriableStatuses` → `'retriable'`;
 * - status present but not in the set → `'fatal'` (the server gave a
 *   definitive non-retriable response);
 * - no numeric status → `'unknown'` (defer to other classifiers in a chain).
 *
 * @param retriableStatuses - HTTP status codes that should trigger a retry.
 *
 * @example
 * ```typescript
 * const classifier = httpStatusClassifier(new Set([500, 502, 503, 504]));
 * ```
 */
export function httpStatusClassifier(retriableStatuses: ReadonlySet<number>): GORetryClassifier {
  return {
    classify(error: unknown): GORetryDecision {
      if (!(error instanceof Error)) return 'unknown';
      const statusCode = (error as { statusCode?: unknown }).statusCode;
      if (typeof statusCode !== 'number') return 'unknown';
      return retriableStatuses.has(statusCode) ? 'retriable' : 'fatal';
    },
  };
}
