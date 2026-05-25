import type { GOBackoffFn } from './GOBackoffFn.js';
import type { GORetryAttemptInfo } from './GORetryAttemptInfo.js';
import type { GORetryClassifier } from './GORetryClassifier.js';
import type { GOSleeper } from './GOSleeper.js';

/** Callback invoked by `GORetryRunner` after a failed attempt, before sleep. */
export type GORetryAttemptHandler = (info: GORetryAttemptInfo) => void;

/**
 * Configuration accepted by {@link GORetryRunner}.
 *
 * All fields are optional with safe defaults; the most common preset
 * factories live in `GOPollingPolicies`.
 */
export interface GORetryRunnerOptions {
  /** Maximum number of attempts (1 try + N-1 retries). Default 3. */
  readonly maxAttempts?: number;

  /**
   * Total elapsed time budget (ms). When exceeded, the runner throws
   * `GOPollingError(kind: 'budget-exceeded')` instead of attempting again.
   * Default: no budget.
   */
  readonly maxElapsedMs?: number;

  /**
   * Backoff strategy. Default `GOBackoff.exponentialJittered()`.
   *
   * Must be a pure function — see EVO-POLL-OPUS-01 §7.9.
   */
  readonly backoff?: GOBackoffFn;

  /**
   * Classifier consulted on each failure. If absent, every error is
   * treated as `'unknown'` and the `unknownDecision` policy applies.
   */
  readonly classifier?: GORetryClassifier;

  /**
   * Behaviour when the classifier returns `'unknown'`.
   * Default `'fatal'` (safety: unrecognised errors do not loop).
   */
  readonly unknownDecision?: 'retriable' | 'fatal';

  /** Abort signal observed at attempt boundaries and during sleep. */
  readonly signal?: AbortSignal;

  /** Sleeper implementation; defaults to {@link GODefaultSleeper}. */
  readonly sleeper?: GOSleeper;

  /**
   * Hook invoked after a failed attempt, before the runner sleeps.
   * Receives the planned delay and the error, useful for telemetry.
   */
  readonly onAttempt?: GORetryAttemptHandler;
}
