import type { GOSleeper } from '@pagopa/go-common/polling';

/**
 * Time source of a run: wall-clock milliseconds, a monotonic counter and an
 * abort-aware sleeper. Injected everywhere a stage waits, so tests run on a
 * virtual clock.
 *
 * Use {@link now} for timestamps (journal, `clientRequestTimeStamp`, age of
 * journaled uploads) and {@link monotonic} for every interval (rate limiter,
 * deadlines, cooldowns), which must not jump when the system clock is
 * adjusted.
 */
export interface DispatchClock extends GOSleeper {
  /** Milliseconds since the epoch (wall clock). */
  now(): number;
  /** Monotonic milliseconds from an arbitrary origin: never goes backwards. */
  monotonic(): number;
}
