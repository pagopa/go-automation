import { GODefaultSleeper } from '@pagopa/go-common/polling';

import type { DispatchClock } from './DispatchClock.js';

/**
 * Real {@link DispatchClock}: `Date.now()` for timestamps,
 * `performance.now()` for intervals and `setTimeout` for sleeps.
 *
 * `now()` stays on the wall clock on purpose: the monotonic clock does not
 * advance while the machine is suspended, so journal timestamps derived from
 * it would drift from the real time of a long run.
 */
export class SystemClock implements DispatchClock {
  private readonly sleeper = new GODefaultSleeper();

  public now(): number {
    return Date.now();
  }

  public monotonic(): number {
    return performance.now();
  }

  public async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return this.sleeper.sleep(ms, signal);
  }
}
