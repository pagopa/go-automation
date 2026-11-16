import type { GORetryDecision } from './GORetryDecision.js';

/**
 * Decision returned by a {@link GORetryClassifier} with optional delay override.
 *
 * Lets a classifier propagate a server-driven delay (e.g. HTTP `Retry-After`
 * header) without resorting to mutable closures in the backoff factory.
 *
 * When `delayMs` is present AND `decision === 'retriable'`, the runner uses
 * `delayMs` for the next sleep instead of invoking the configured backoff.
 * The override is one-shot and does NOT update `previousDelayMs` (so it
 * cannot perturb the natural backoff sequence of subsequent attempts).
 */
export interface GORetryAdvice {
  readonly decision: GORetryDecision;
  /**
   * Explicit override of the delay (ms) for this single attempt.
   * Ignored unless `decision === 'retriable'`.
   */
  readonly delayMs?: number;
}
