import type { GOSleeper } from '@go-automation/go-common/core';

/**
 * Time source of a run: wall-clock milliseconds and an abort-aware sleeper.
 * Injected everywhere a stage waits, so tests run on a virtual clock.
 */
export interface DispatchClock extends GOSleeper {
  /** Milliseconds since the epoch. */
  now(): number;
}
