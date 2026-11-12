/**
 * Information passed to `GOPoller.onAttempt` after a `continue` check,
 * before the runner sleeps for the next probe.
 *
 * `reason` and `progress` are copied from the `continue` decision returned
 * by the check; they let callers emit structured logs without coupling
 * the poller to the polled domain.
 */
export interface GOPollAttemptInfo {
  /** Zero-based attempt index that just returned `continue`. */
  readonly attempt: number;
  /** Milliseconds elapsed since `poll()` started. */
  readonly elapsedMs: number;
  /** Delay (ms) the poller will wait before the next probe. */
  readonly nextDelayMs: number;
  /** Reason from `GOPollDecisionContinue.reason`, if any. */
  readonly reason?: string;
  /** Progress payload from `GOPollDecisionContinue.progress`, if any. */
  readonly progress?: Readonly<Record<string, unknown>>;
}
