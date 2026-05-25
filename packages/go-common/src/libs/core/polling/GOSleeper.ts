/**
 * Abort-aware sleep interface used by {@link GOPoller} and {@link GORetryRunner}.
 *
 * Injectable for tests (fake sleeper) and to allow alternative timer
 * implementations (e.g. unref'd timers in long-running daemons).
 */
export interface GOSleeper {
  /**
   * Waits for `ms` milliseconds.
   *
   * If `signal` is already aborted at call time, rejects synchronously.
   * If `signal` aborts during the wait, rejects immediately (no remaining
   * delay) and clears the underlying timer.
   *
   * Rejection on abort SHOULD be a {@link GOPollingError} with kind `'aborted'`
   * so the runner can branch on it uniformly.
   *
   * @param ms - Number of milliseconds to wait (must be >= 0).
   * @param signal - Optional abort signal observed for the duration of the sleep.
   */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}
