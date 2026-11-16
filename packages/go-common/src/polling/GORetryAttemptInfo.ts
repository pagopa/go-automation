/**
 * Information passed to `GORetryRunner.onAttempt` after a failed attempt
 * and before the runner sleeps for the next try.
 */
export interface GORetryAttemptInfo {
  /** Zero-based attempt index that just failed. */
  readonly attempt: number;
  /** Milliseconds elapsed since `run()` started. */
  readonly elapsedMs: number;
  /** Error returned by the operation on this attempt. */
  readonly lastError: Error;
  /** Delay (ms) the runner will wait before the next attempt. */
  readonly nextDelayMs: number;
  /**
   * True when `nextDelayMs` came from the classifier's `GORetryAdvice.delayMs`
   * (e.g. server-driven `Retry-After`) instead of the configured backoff.
   *
   * Useful for telemetry: distinguishes "we waited because the server told us
   * to" from "we waited because our backoff policy said so".
   */
  readonly delayOverridden: boolean;
}
