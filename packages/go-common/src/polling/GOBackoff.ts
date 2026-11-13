import type { GOBackoffFn } from './GOBackoffFn.js';

/** Default base delay (ms) for exponential strategies. */
const DEFAULT_BACKOFF_BASE_MS = 500;

/** Default cap (ms) for exponential strategies. */
const DEFAULT_BACKOFF_CAP_MS = 3000;

/**
 * Factory namespace for backoff strategies.
 *
 * Every factory returns a **pure** {@link GOBackoffFn}: state is delivered
 * by the runner via {@link GOBackoffContext}, never closed over at factory
 * level. Two concurrent runs that share the same instance never contaminate
 * each other.
 *
 * @example
 * ```typescript
 * const backoff = GOBackoff.exponentialJittered(100, 5000);
 * const delay = backoff({ attempt: 0 }); // random in [0, 100)
 * ```
 */
export const GOBackoff = {
  /**
   * Constant delay: returns `delayMs` regardless of attempt.
   *
   * @param delayMs - Fixed delay in milliseconds (must be >= 0).
   */
  constant:
    (delayMs: number): GOBackoffFn =>
    () =>
      delayMs,

  /**
   * Linear backoff: `baseMs * (attempt + 1)`, optionally capped.
   *
   * @param baseMs - Base delay in milliseconds.
   * @param capMs - Optional maximum delay; omit for no cap.
   */
  linear:
    (baseMs: number, capMs?: number): GOBackoffFn =>
    ({ attempt }) =>
      clamp(baseMs * (attempt + 1), capMs),

  /**
   * Exponential backoff: `baseMs * 2^attempt`, capped at `capMs`.
   *
   * Default sequence (`baseMs=500`, `capMs=3000`): 500, 1000, 2000, 3000, 3000, ...
   *
   * @param baseMs - Base delay in milliseconds (default 500).
   * @param capMs - Maximum delay (default 3000).
   */
  exponential:
    (baseMs: number = DEFAULT_BACKOFF_BASE_MS, capMs: number = DEFAULT_BACKOFF_CAP_MS): GOBackoffFn =>
    ({ attempt }) =>
      Math.min(baseMs * 2 ** attempt, capMs),

  /**
   * Exponential backoff with full jitter.
   *
   * Returns a random integer in `[0, min(baseMs * 2^attempt, capMs))` —
   * the upper bound is **exclusive** because the implementation is
   * `Math.floor(Math.random() * bound)` and `Math.random()` returns `[0, 1)`.
   * Practical effect: the maximum observable value is `min(...) - 1`.
   *
   * AWS-recommended for combating thundering herd effects.
   *
   * @param baseMs - Base delay in milliseconds (default 500).
   * @param capMs - Maximum delay before jitter (default 3000).
   */
  exponentialJittered:
    (baseMs: number = DEFAULT_BACKOFF_BASE_MS, capMs: number = DEFAULT_BACKOFF_CAP_MS): GOBackoffFn =>
    ({ attempt }) =>
      Math.floor(Math.random() * Math.min(baseMs * 2 ** attempt, capMs)),

  /**
   * Decorrelated jitter (AWS Architecture Blog).
   *
   * Formula: `min(capMs, baseMs + random(0, previousDelayMs * 3 - baseMs))`.
   * On the first attempt (no `previousDelayMs`), uses `baseMs` as the seed.
   *
   * State is delivered via {@link GOBackoffContext.previousDelayMs}; the factory
   * is pure and safe to share across concurrent runs.
   *
   * @param baseMs - Base delay in milliseconds (default 500).
   * @param capMs - Maximum delay (default 3000).
   */
  decorrelatedJittered:
    (baseMs: number = DEFAULT_BACKOFF_BASE_MS, capMs: number = DEFAULT_BACKOFF_CAP_MS): GOBackoffFn =>
    ({ previousDelayMs }) => {
      const last = previousDelayMs ?? baseMs;
      // Window is [baseMs, min(cap, last * 3)] inclusive of baseMs, exclusive of upper bound.
      // Edge cases handled by the two clamps:
      // - `span = max(0, upper - baseMs)` prevents `Math.random() * negative` when
      //   `upper < baseMs` (e.g. misconfigured `capMs < baseMs`): span collapses
      //   to 0, so the additive jitter is 0 and the value before the final clamp
      //   is exactly `baseMs`.
      // - The trailing `Math.min(capMs, ...)` enforces the cap on top of that:
      //   when `capMs < baseMs`, the result is `capMs` (NOT `baseMs`); when the
      //   cap is loose, the additive jitter passes through unchanged.
      const upper = Math.min(capMs, last * 3);
      const span = Math.max(0, upper - baseMs);
      return Math.min(capMs, baseMs + Math.floor(Math.random() * span));
    },
} as const;

function clamp(value: number, cap: number | undefined): number {
  return cap === undefined ? value : Math.min(value, cap);
}
