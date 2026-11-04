/**
 * Internal queue entry of {@link ./GORateLimiter.GORateLimiter}.
 *
 * `settled` is mutable on purpose: it implements O(1) lazy removal when the
 * caller's signal aborts while the entry is still queued.
 */
export interface GORateLimiterWaiter {
  settled: boolean;

  /** Hands the permit to the queued caller (resolves its `acquire()`). */
  grant(): void;

  /** Rejects the queued caller's `acquire()` when the limiter itself fails. */
  fail(error: Error): void;
}
