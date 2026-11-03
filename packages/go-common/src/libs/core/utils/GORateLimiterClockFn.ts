/**
 * Monotonic clock used by {@link ./GORateLimiter.GORateLimiter}.
 *
 * Returns the current time in milliseconds. Injectable so tests can drive the
 * limiter with a fake clock; the default is `performance.now()`.
 */
export type GORateLimiterClockFn = () => number;
