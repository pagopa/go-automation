import type { GORateLimiter } from '@go-automation/go-common/core';

import type { DispatchClock } from '../model/DispatchClock.js';

const DECREASE_FACTOR = 0.75;
const INCREASE_FACTOR = 1.1;
const MIN_RATE = 1;
const RECOVERY_INTERVAL_MS = 30_000;

/**
 * Adapts the limiter rate to `429` responses (§10.3): −25% on each `429`
 * (minimum 1/s), +10% after every 30 s without `429`, up to the configured
 * rate. Driven by events, no timers.
 */
export class RateAdapter {
  private lastChangeAt = 0;
  private throttled = 0;

  constructor(
    private readonly limiter: GORateLimiter,
    private readonly targetRate: number,
    private readonly clock: DispatchClock,
    private readonly enabled: boolean,
  ) {}

  /** Number of `429` received. */
  public get throttledCount(): number {
    return this.throttled;
  }

  /**
   * Records a `429` and lowers the rate.
   *
   * @returns The new rate, when it changed
   */
  public onThrottled(): number | undefined {
    this.throttled += 1;
    if (!this.enabled) return undefined;
    const next = Math.max(MIN_RATE, this.limiter.ratePerSecond * DECREASE_FACTOR);
    this.lastChangeAt = this.clock.now();
    if (next === this.limiter.ratePerSecond) return undefined;
    this.limiter.setRate(next);
    return next;
  }

  /**
   * Records a successful call and raises the rate if it was lowered and no
   * `429` arrived for 30 s.
   *
   * @returns The new rate, when it changed
   */
  public onSuccess(): number | undefined {
    if (!this.enabled || this.limiter.ratePerSecond >= this.targetRate) return undefined;
    const now = this.clock.now();
    if (now - this.lastChangeAt < RECOVERY_INTERVAL_MS) return undefined;
    const next = Math.min(this.targetRate, this.limiter.ratePerSecond * INCREASE_FACTOR);
    this.lastChangeAt = now;
    this.limiter.setRate(next);
    return next;
  }
}
