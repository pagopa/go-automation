import type { GORetryAdvice } from './GORetryAdvice.js';
import type { GORetryDecision } from './GORetryDecision.js';

/**
 * Decides whether an error should trigger a retry.
 *
 * Implementations may return a bare {@link GORetryDecision} (the common case)
 * or a {@link GORetryAdvice} when they need to propagate a delay override
 * (e.g. HTTP `Retry-After`). The runner normalises both shapes internally.
 */
export interface GORetryClassifier {
  classify(error: unknown): GORetryDecision | GORetryAdvice;
}
