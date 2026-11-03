import type { GORateLimiterGrantFn } from './GORateLimiterGrantFn.js';

/**
 * Internal queue entry of {@link ./GORateLimiter.GORateLimiter}.
 *
 * `settled` is mutable on purpose: it implements O(1) lazy removal when the
 * caller's signal aborts while the entry is still queued.
 */
export interface GORateLimiterWaiter {
  readonly grant: GORateLimiterGrantFn;
  settled: boolean;
}
