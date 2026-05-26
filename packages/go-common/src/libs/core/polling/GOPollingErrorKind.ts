/**
 * Categories of errors raised by the polling/retry infrastructure itself.
 *
 * These represent **infrastructure failures** of {@link GOPoller} /
 * {@link GORetryRunner}, distinct from domain errors propagated through
 * the operation/check function.
 */
export type GOPollingErrorKind =
  /** Maximum number of attempts reached without a terminal success. */
  | 'timeout'
  /** Operation aborted via AbortSignal (before or during sleep). */
  | 'aborted'
  /** Total elapsed time exceeded `maxElapsedMs` budget. */
  | 'budget-exceeded'
  /** Defensive: retry runner configured with maxAttempts=0 (no attempt was performed). */
  | 'exhausted';
