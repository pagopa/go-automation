/**
 * Concurrency-limited task runner.
 *
 * Schedules async tasks so that no more than `limit` are in-flight at the same time.
 * Useful for rate-limiting outbound HTTP requests, parallel file processing, or
 * any I/O-bound workload where unbounded concurrency would saturate the system or
 * trip remote rate limits.
 *
 * The pool preserves submission order for queued tasks (FIFO) and resolves each
 * `run()` call with the value (or rejection) of its task.
 *
 * @example
 * ```typescript
 * const pool = new GOConcurrencyPool(5);
 * const results = await Promise.all(
 *   urls.map((url) => pool.run(() => fetch(url))),
 * );
 * await pool.drain();
 * ```
 */
/**
 * Continuation invoked when a queued task acquires a slot.
 */
export type GOConcurrencyPoolReleaseFn = () => void;

/**
 * Async task factory accepted by `GOConcurrencyPool.run`.
 */
export type GOConcurrencyPoolTaskFn<T> = () => Promise<T>;

export class GOConcurrencyPool {
  private readonly limit: number;
  private active: number = 0;

  /**
   * FIFO queue of acquire waiters — callbacks that increment `active` and
   * resolve the parked `run()` promise.
   */
  private readonly acquireQueue: GOConcurrencyPoolReleaseFn[] = [];

  /**
   * Snapshot waiters from `drain()`. Kept separate from `acquireQueue` so a
   * `release()` cannot accidentally wake a drain waiter while there are still
   * acquire waiters parked behind it (which would deadlock — see the test
   * `drain does not steal slots from acquire waiters`).
   */
  private readonly drainWaiters: GOConcurrencyPoolReleaseFn[] = [];

  constructor(limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`GOConcurrencyPool: limit must be a positive integer (got ${limit})`);
    }
    this.limit = limit;
  }

  /**
   * Submits a task. Resolves with the task's result or rejects with its error.
   *
   * @param task - Factory that returns a promise. Called only when a slot is free.
   * @returns Promise resolving to the task's value
   */
  public async run<T>(task: GOConcurrencyPoolTaskFn<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  /**
   * Resolves once the pool has no in-flight tasks and no queued tasks
   * waiting to acquire a slot. The snapshot is taken at call time: tasks
   * submitted *after* `drain()` is awaited still get processed, but the
   * promise returned by *this* drain() call resolves once the queue that
   * existed at that point has fully drained.
   *
   * Idempotent and safe to call concurrently from multiple callers; each
   * call gets its own waiter.
   */
  public async drain(): Promise<void> {
    if (this.active === 0 && this.acquireQueue.length === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.drainWaiters.push(resolve);
    });
  }

  /**
   * Returns the current number of in-flight tasks (for diagnostics).
   */
  public get activeCount(): number {
    return this.active;
  }

  /**
   * Returns the current number of queued tasks (for diagnostics).
   */
  public get queuedCount(): number {
    return this.acquireQueue.length;
  }

  private async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.acquireQueue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private release(): void {
    this.active--;
    const nextAcquire = this.acquireQueue.shift();
    if (nextAcquire !== undefined) {
      nextAcquire();
      return;
    }
    // No more queued tasks. If we just brought the pool to idle, wake every
    // pending drain waiter snapshot. Splice avoids re-entrancy: a drain
    // waiter that immediately re-enqueues work via `run()` after resolving
    // does not interfere with the iteration.
    if (this.active === 0 && this.drainWaiters.length > 0) {
      const waiters = this.drainWaiters.splice(0);
      for (const resolveWaiter of waiters) {
        resolveWaiter();
      }
    }
  }
}
