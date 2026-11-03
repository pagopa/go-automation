import type { GORateLimiter } from '@go-automation/go-common/core';

import type { DispatchClock } from '../model/DispatchClock.js';

/**
 * Waits for a limiter permit unless the run is stopping.
 *
 * @param limiter - Shared B2B limiter
 * @param priority - Queue priority (0 = sends)
 * @param signal - Run stop signal
 * @returns `false` when the run is stopping
 */
export async function acquireUnlessStopped(
  limiter: GORateLimiter,
  priority: number,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) return false;
  try {
    await limiter.acquire(priority, signal);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sleeps unless the run is stopping.
 *
 * @param clock - Run clock
 * @param ms - Delay
 * @param signal - Run stop signal
 * @returns `false` when the run is stopping
 */
export async function sleepUnlessStopped(clock: DispatchClock, ms: number, signal: AbortSignal): Promise<boolean> {
  try {
    await clock.sleep(ms, signal);
    return true;
  } catch {
    return false;
  }
}
