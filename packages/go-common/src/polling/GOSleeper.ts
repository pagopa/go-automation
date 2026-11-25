/**
 * Abort-aware sleep interface used by `GOPoller` and `GORetryRunner`.
 *
 * Injectable for tests (fake sleeper) and to allow alternative timer
 * implementations (e.g. unref'd timers in long-running daemons).
 */
export interface GOSleeper {
  /**
   * Waits for `ms` milliseconds, returning a Promise that resolves when the
   * delay elapses.
   *
   * Abort behaviour (the returned Promise is always the rejection channel —
   * "synchronously" never applies because `sleep` returns a Promise):
   * - If `signal` is already aborted at call time, the returned Promise
   *   rejects immediately, without scheduling the timer.
   * - If `signal` aborts during the wait, the Promise rejects immediately
   *   (without waiting the remaining delay) and the implementation clears
   *   the underlying timer to avoid leaks.
   *
   * Rejection on abort SHOULD be a {@link ./GOPollingError.GOPollingError}
   * with kind `'aborted'` so the runner can branch on it uniformly.
   *
   * @param ms - Number of milliseconds to wait (must be >= 0).
   * @param signal - Optional abort signal observed for the duration of the sleep.
   */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}
