/**
 * Snapshot of the counters of {@link ./GORateLimiter.GORateLimiter}.
 */
export interface GORateLimiterStats {
  /** Current rate in permits per second (changes with `setRate`). */
  readonly ratePerSecond: number;

  /** Permits granted since creation. */
  readonly granted: number;

  /** Acquisitions rejected because their signal aborted while queued. */
  readonly aborted: number;

  /** Callers currently waiting, all priorities included. */
  readonly queued: number;

  /** Callers currently waiting, by priority (index = priority). */
  readonly queuedByPriority: ReadonlyArray<number>;

  /** Mean wait between `acquire()` and grant, in milliseconds. */
  readonly averageWaitMs: number;

  /** Longest wait between `acquire()` and grant, in milliseconds. */
  readonly maxWaitMs: number;
}
