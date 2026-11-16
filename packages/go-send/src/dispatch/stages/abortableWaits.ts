import type { GORateLimiter } from '@pagopa/go-common/concurrency';

import type { DispatchClock } from '../model/DispatchClock.js';

/**
 * Waits for a limiter permit unless the run is stopping.
 *
 * @param limiter - Shared B2B limiter
 * @param priority - Queue priority (0 = sends)
 * @param signal - Run stop signal
 * @returns `false` when the run is stopping
 * @throws Any limiter error that is not caused by the stop
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
  } catch (error: unknown) {
    if (signal.aborted) return false;
    throw error;
  }
}

/**
 * Sleeps unless the run is stopping.
 *
 * @param clock - Run clock
 * @param ms - Delay
 * @param signal - Run stop signal
 * @returns `false` when the run is stopping
 * @throws Any sleeper error that is not caused by the stop
 */
export async function sleepUnlessStopped(clock: DispatchClock, ms: number, signal: AbortSignal): Promise<boolean> {
  try {
    await clock.sleep(ms, signal);
    return true;
  } catch (error: unknown) {
    if (signal.aborted) return false;
    throw error;
  }
}
