import type { GORateLimiter } from '@pagopa/go-common/concurrency';

import type { DispatchClock } from '../model/DispatchClock.js';

const DECREASE_FACTOR = 0.75;
const INCREASE_FACTOR = 1.1;
/** Floor of the reductions, unless the configured rate is already lower. */
const MIN_RATE = 1;
const RECOVERY_INTERVAL_MS = 30_000;
/**
 * `429`s within this window of a decrease are one throttling episode: the
 * requests already in flight when the first `429` arrived must not each cut
 * the rate again.
 */
const DECREASE_COOLDOWN_MS = 1_000;

/**
 * Adapts the limiter rate to `429` responses (§10.3): −25% per throttling
 * episode (the `429`s within 1 s of a decrease count once; minimum 1/s, or
 * the configured rate when it is lower), +10% after every 30 s without
 * `429`, up to the configured rate. The rate never exceeds the configured
 * one. Driven by events, no timers.
 */
export class RateAdapter {
  private lastChangeAt: number;
  private lastDecreaseAt = Number.NEGATIVE_INFINITY;
  private throttled = 0;

  constructor(
    private readonly limiter: GORateLimiter,
    private readonly targetRate: number,
    private readonly clock: DispatchClock,
    private readonly enabled: boolean,
  ) {
    this.lastChangeAt = clock.monotonic();
  }

  /** Number of `429` received. */
  public get throttledCount(): number {
    return this.throttled;
  }

  /**
   * Records a `429` and lowers the rate, once per throttling episode.
   *
   * @returns The new rate, when it changed
   */
  public onThrottled(): number | undefined {
    this.throttled += 1;
    if (!this.enabled) return undefined;
    const now = this.clock.monotonic();
    this.lastChangeAt = now; // any 429 postpones the recovery
    if (now - this.lastDecreaseAt < DECREASE_COOLDOWN_MS) return undefined;
    this.lastDecreaseAt = now;
    // Never above the configured rate: with --rate 0.5 a floor of 1/s would raise it.
    const floor = Math.min(MIN_RATE, this.targetRate);
    const next = Math.max(floor, this.limiter.ratePerSecond * DECREASE_FACTOR);
    if (next >= this.limiter.ratePerSecond) return undefined;
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
    const now = this.clock.monotonic();
    if (now - this.lastChangeAt < RECOVERY_INTERVAL_MS) return undefined;
    const next = Math.min(this.targetRate, this.limiter.ratePerSecond * INCREASE_FACTOR);
    this.lastChangeAt = now;
    this.limiter.setRate(next);
    return next;
  }
}
