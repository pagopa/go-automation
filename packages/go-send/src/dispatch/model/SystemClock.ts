import { GODefaultSleeper } from '@go-automation/go-common/core';

import type { DispatchClock } from './DispatchClock.js';

/**
 * Real {@link DispatchClock}: `Date.now()` and `setTimeout`.
 */
export class SystemClock implements DispatchClock {
  private readonly sleeper = new GODefaultSleeper();

  public now(): number {
    return Date.now();
  }

  public async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return this.sleeper.sleep(ms, signal);
  }
}
