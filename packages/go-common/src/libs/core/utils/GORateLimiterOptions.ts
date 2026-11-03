import type { GOSleeper } from '../polling/GOSleeper.js';
import type { GORateLimiterClockFn } from './GORateLimiterClockFn.js';

/**
 * Options of {@link ./GORateLimiter.GORateLimiter}.
 */
export interface GORateLimiterOptions {
  /** Tokens generated per second (e.g. `20`). Must be > 0. */
  readonly ratePerSecond: number;

  /**
   * Bucket capacity (default `1`). With `1` permits are spaced uniformly
   * (`1000 / ratePerSecond` ms apart), so no window of one second, however
   * aligned, sees more than `ratePerSecond + 1` permits.
   */
  readonly burst?: number;

  /** Number of priority queues (default `1`). Priority `0` is the highest. */
  readonly priorities?: number;

  /** Sleeper used by the internal timer (default: `GODefaultSleeper`). */
  readonly sleeper?: GOSleeper;

  /** Clock in milliseconds (default: `performance.now()`). */
  readonly now?: GORateLimiterClockFn;
}
