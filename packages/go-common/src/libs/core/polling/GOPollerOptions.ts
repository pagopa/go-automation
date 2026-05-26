import type { GOBackoffFn } from './GOBackoffFn.js';
import type { GOPollAttemptInfo } from './GOPollAttemptInfo.js';
import type { GOSleeper } from './GOSleeper.js';

/** Callback invoked by `GOPoller` after a `continue` check, before sleep. */
export type GOPollAttemptHandler = (info: GOPollAttemptInfo) => void;

/**
 * Configuration accepted by `GOPoller`.
 *
 * All fields are optional with sensible defaults; the most common preset
 * factories live in `GOPollingPolicies` (Athena, CloudWatch Logs, SEND IUN, ...).
 */
export interface GOPollerOptions {
  /** Maximum number of probes before throwing `GOPollingError(kind: 'timeout')`. Default 60. */
  readonly maxAttempts?: number;

  /**
   * Total elapsed time budget (ms). When exceeded, the poller throws
   * `GOPollingError(kind: 'budget-exceeded')`. Default: no budget.
   */
  readonly maxElapsedMs?: number;

  /**
   * Backoff strategy. Default `GOBackoff.exponential()`.
   *
   * Must be a pure function — see EVO-POLL-OPUS-01 §7.9.
   */
  readonly backoff?: GOBackoffFn;

  /** Abort signal observed at attempt boundaries and during sleep. */
  readonly signal?: AbortSignal;

  /** Sleeper implementation; defaults to `GODefaultSleeper`. */
  readonly sleeper?: GOSleeper;

  /**
   * Hook invoked after a `continue` decision, before the sleep.
   * Receives the planned delay plus `reason`/`progress` from the check.
   */
  readonly onAttempt?: GOPollAttemptHandler;
}
