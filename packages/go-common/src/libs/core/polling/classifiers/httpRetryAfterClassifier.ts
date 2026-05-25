import type { GORetryAdvice } from '../GORetryAdvice.js';
import type { GORetryClassifier } from '../GORetryClassifier.js';

/**
 * Creates a classifier that recognises retriable HTTP statuses AND propagates
 * a server-driven delay if the error carries `retryAfterMs`.
 *
 * Replaces the legacy pattern of a backoff factory with a mutable `withRetryAfter`
 * setter (see EVO-POLL-OPUS-01 §7.9): the override is veicolato dal classifier
 * stesso come `GORetryAdvice.delayMs`, never via shared mutable state.
 *
 * The error must expose:
 * - `statusCode: number` — to determine retriability;
 * - `retryAfterMs: number` (optional) — server-driven delay in milliseconds.
 *
 * Behaviour:
 * - status in `retriableStatuses` + `retryAfterMs` present → `{ decision: 'retriable', delayMs: retryAfterMs }`;
 * - status in `retriableStatuses` without `retryAfterMs` → `{ decision: 'retriable' }`;
 * - status present but not in set → `{ decision: 'fatal' }`;
 * - no numeric status → `{ decision: 'unknown' }`.
 *
 * @param retriableStatuses - HTTP status codes that should trigger a retry.
 *
 * @example
 * ```typescript
 * const classifier = httpRetryAfterClassifier(new Set([429, 500, 502, 503, 504]));
 * ```
 */
export function httpRetryAfterClassifier(retriableStatuses: ReadonlySet<number>): GORetryClassifier {
  return {
    classify(error: unknown): GORetryAdvice {
      if (!(error instanceof Error)) return { decision: 'unknown' };

      const statusCode = (error as { statusCode?: unknown }).statusCode;
      if (typeof statusCode !== 'number') return { decision: 'unknown' };

      if (!retriableStatuses.has(statusCode)) return { decision: 'fatal' };

      const retryAfterMs = (error as { retryAfterMs?: unknown }).retryAfterMs;
      return typeof retryAfterMs === 'number' && retryAfterMs >= 0
        ? { decision: 'retriable', delayMs: retryAfterMs }
        : { decision: 'retriable' };
    },
  };
}
