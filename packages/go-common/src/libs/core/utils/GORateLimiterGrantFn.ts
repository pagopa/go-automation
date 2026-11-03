/**
 * Callback that hands a permit to a caller queued in
 * {@link ./GORateLimiter.GORateLimiter}.
 */
export type GORateLimiterGrantFn = () => void;
