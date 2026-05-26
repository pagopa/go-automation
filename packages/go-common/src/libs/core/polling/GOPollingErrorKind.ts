/**
 * Categories of errors raised by the polling/retry infrastructure itself.
 *
 * These represent **infrastructure failures** of {@link GOPoller} /
 * {@link GORetryRunner}, distinct from domain errors propagated through
 * the operation/check function.
 */
export type GOPollingErrorKind =
  /** `GOPoller`: max attempts reached without a terminal `success` or `failure` decision. */
  | 'timeout'
  /** Operation aborted via `AbortSignal` (before entry, between attempts, or during sleep). */
  | 'aborted'
  /** Total elapsed time exceeded the configured `maxElapsedMs` budget. */
  | 'budget-exceeded'
  /**
   * `GORetryRunner`: emitted ONLY in the degenerate `maxAttempts: 0` configuration
   * (no attempt ever ran). When the runner exhausts a normal retry budget (>=1
   * attempt configured), it propagates the **last operation error** instead —
   * preserving the domain error type — and does NOT use this kind.
   */
  | 'exhausted';
