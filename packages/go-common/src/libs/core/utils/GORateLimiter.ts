import { GODefaultSleeper } from '../polling/GODefaultSleeper.js';
import type { GOSleeper } from '../polling/GOSleeper.js';
import type { GORateLimiterClockFn } from './GORateLimiterClockFn.js';
import type { GORateLimiterOptions } from './GORateLimiterOptions.js';
import type { GORateLimiterStats } from './GORateLimiterStats.js';
import type { GORateLimiterWaiter } from './GORateLimiterWaiter.js';

/** Tolerance for floating-point token accounting. */
const TOKEN_EPSILON = 1e-9;

/** Consumed queue entries kept before compacting a queue array. */
const COMPACT_THRESHOLD = 1024;

/**
 * Token-bucket rate limiter with strict priorities.
 *
 * Limits the *frequency* of operations, unlike `GOConcurrencyPool`, which
 * limits how many run at the same time. Typical use: keep outbound calls to an
 * API under an agreed rate, while letting high-priority calls (e.g. sends)
 * overtake low-priority ones (e.g. status checks).
 *
 * - Continuous refill, a single internal timer (no timer per caller), O(1)
 *   `acquire` and grant.
 * - Strict priority: a permit goes to priority `p` only when every queue with
 *   a higher priority (lower number) is empty. FIFO within the same priority.
 * - State is per instance: create one limiter per run and pass it to the
 *   components that share the budget.
 *
 * @example
 * ```typescript
 * const limiter = new GORateLimiter({ ratePerSecond: 20, priorities: 2 });
 * await limiter.acquire(0); // send
 * await limiter.acquire(1); // status check, only with spare capacity
 * ```
 */
export class GORateLimiter {
  private readonly burst: number;
  private readonly sleeper: GOSleeper;
  private readonly now: GORateLimiterClockFn;
  private readonly queues: GORateLimiterWaiter[][];
  private readonly heads: number[];
  private readonly live: number[];

  private rate: number;
  private tokens: number;
  private lastRefill: number;
  private pumping = false;
  private pumpWake: AbortController | undefined = undefined;

  private granted = 0;
  private aborted = 0;
  private totalWaitMs = 0;
  private maxWaitMs = 0;

  constructor(options: GORateLimiterOptions) {
    assertPositiveRate(options.ratePerSecond);
    const burst = options.burst ?? 1;
    const priorities = options.priorities ?? 1;
    if (!Number.isInteger(burst) || burst < 1) {
      throw new Error(`GORateLimiter: burst must be a positive integer (got ${burst})`);
    }
    if (!Number.isInteger(priorities) || priorities < 1) {
      throw new Error(`GORateLimiter: priorities must be a positive integer (got ${priorities})`);
    }

    this.rate = options.ratePerSecond;
    this.burst = burst;
    this.sleeper = options.sleeper ?? new GODefaultSleeper();
    this.now = options.now ?? ((): number => performance.now());
    this.queues = Array.from({ length: priorities }, (): GORateLimiterWaiter[] => []);
    this.heads = Array.from({ length: priorities }, (): number => 0);
    this.live = Array.from({ length: priorities }, (): number => 0);
    this.tokens = burst;
    this.lastRefill = this.now();
  }

  /**
   * Waits for a permit.
   *
   * @param priority - Queue to wait in, `0` (default) is the highest
   * @param signal - Optional signal; aborting removes the caller from the queue
   *   without consuming a permit and rejects with the signal's reason
   * @returns Promise resolved when the permit is granted
   */
  public async acquire(priority: number = 0, signal?: AbortSignal): Promise<void> {
    if (!Number.isInteger(priority) || priority < 0 || priority >= this.queues.length) {
      throw new Error(`GORateLimiter: priority must be an integer in [0, ${this.queues.length - 1}] (got ${priority})`);
    }
    if (signal?.aborted === true) {
      throw abortReason(signal);
    }

    this.refill();
    if (this.queuedCount() === 0 && this.tokens >= 1 - TOKEN_EPSILON) {
      this.tokens -= 1;
      this.recordGrant(0);
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const enqueuedAt = this.now();
      const onAbort = (): void => {
        if (waiter.settled) return;
        waiter.settled = true;
        this.decrementLive(priority);
        this.aborted += 1;
        reject(abortReason(signal));
      };
      const waiter: GORateLimiterWaiter = {
        settled: false,
        grant: (): void => {
          signal?.removeEventListener('abort', onAbort);
          this.recordGrant(this.now() - enqueuedAt);
          resolve();
        },
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.queueAt(priority).push(waiter);
      this.live[priority] = this.liveAt(priority) + 1;
      this.ensurePump();
    });
  }

  /**
   * Changes the rate (e.g. to back off after a `429`). Tokens accrued so far
   * are kept; callers already queued are served at the new rate.
   *
   * @param ratePerSecond - New rate, > 0
   */
  public setRate(ratePerSecond: number): void {
    assertPositiveRate(ratePerSecond);
    this.refill();
    this.rate = ratePerSecond;
    this.pumpWake?.abort();
  }

  /** Current rate in permits per second. */
  public get ratePerSecond(): number {
    return this.rate;
  }

  /** Snapshot of the counters. */
  public get stats(): GORateLimiterStats {
    return {
      ratePerSecond: this.rate,
      granted: this.granted,
      aborted: this.aborted,
      queued: this.queuedCount(),
      queuedByPriority: [...this.live],
      averageWaitMs: this.granted === 0 ? 0 : this.totalWaitMs / this.granted,
      maxWaitMs: this.maxWaitMs,
    };
  }

  private ensurePump(): void {
    if (this.pumping) return;
    this.pumping = true;
    void this.pump();
  }

  private async pump(): Promise<void> {
    try {
      while (this.queuedCount() > 0) {
        this.refill();
        while (this.tokens >= 1 - TOKEN_EPSILON) {
          const waiter = this.nextWaiter();
          if (waiter === undefined) break;
          this.tokens -= 1;
          waiter.grant();
        }
        if (this.queuedCount() === 0) break;
        await this.sleepUntilNextToken();
      }
    } finally {
      this.pumping = false;
    }
  }

  private async sleepUntilNextToken(): Promise<void> {
    const waitMs = Math.max(1, Math.ceil(((1 - this.tokens) * 1000) / this.rate));
    const wake = new AbortController();
    this.pumpWake = wake;
    try {
      await this.sleeper.sleep(waitMs, wake.signal);
    } catch {
      // Woken early by setRate(): the loop recomputes the wait at the new rate.
    } finally {
      this.pumpWake = undefined;
    }
  }

  private nextWaiter(): GORateLimiterWaiter | undefined {
    for (let priority = 0; priority < this.queues.length; priority++) {
      if (this.liveAt(priority) === 0) continue;
      const queue = this.queueAt(priority);
      let head = this.heads[priority] ?? 0;
      while (head < queue.length) {
        const waiter = queue[head];
        head += 1;
        if (waiter !== undefined && !waiter.settled) {
          waiter.settled = true;
          this.decrementLive(priority);
          this.heads[priority] = head;
          this.compact(priority);
          return waiter;
        }
      }
      this.heads[priority] = head;
      this.compact(priority);
    }
    return undefined;
  }

  private compact(priority: number): void {
    const queue = this.queueAt(priority);
    const head = this.heads[priority] ?? 0;
    if (head === queue.length) {
      queue.length = 0;
      this.heads[priority] = 0;
    } else if (head > COMPACT_THRESHOLD && head * 2 > queue.length) {
      queue.splice(0, head);
      this.heads[priority] = 0;
    }
  }

  private refill(): void {
    const current = this.now();
    const elapsed = current - this.lastRefill;
    if (elapsed > 0) {
      this.tokens = Math.min(this.burst, this.tokens + (elapsed * this.rate) / 1000);
      this.lastRefill = current;
    }
  }

  private recordGrant(waitMs: number): void {
    this.granted += 1;
    this.totalWaitMs += waitMs;
    if (waitMs > this.maxWaitMs) this.maxWaitMs = waitMs;
  }

  private queuedCount(): number {
    let total = 0;
    for (const count of this.live) total += count;
    return total;
  }

  private queueAt(priority: number): GORateLimiterWaiter[] {
    const queue = this.queues[priority];
    if (queue === undefined) throw new Error(`GORateLimiter: no queue for priority ${priority}`);
    return queue;
  }

  private liveAt(priority: number): number {
    return this.live[priority] ?? 0;
  }

  private decrementLive(priority: number): void {
    this.live[priority] = this.liveAt(priority) - 1;
  }
}

function assertPositiveRate(ratePerSecond: number): void {
  if (!Number.isFinite(ratePerSecond) || ratePerSecond <= 0) {
    throw new Error(`GORateLimiter: ratePerSecond must be a finite number > 0 (got ${ratePerSecond})`);
  }
}

function abortReason(signal: AbortSignal | undefined): Error {
  const reason: unknown = signal?.reason;
  return reason instanceof Error ? reason : new Error('GORateLimiter: acquire aborted');
}
