/**
 * Monotonic clock used by {@link ./GORateLimiter.GORateLimiter}.
 *
 * Returns the current time in milliseconds. Injectable so tests can drive the
 * limiter with a fake clock; the default is `performance.now()`.
 *
 * Must be monotonic (never decreasing): `Date.now()` is not, since it follows
 * wall-clock adjustments. A reading lower than the previous one is tolerated
 * (the limiter re-anchors on it, without creating tokens) but the elapsed time
 * across the jump is lost.
 */
export type GORateLimiterClockFn = () => number;
