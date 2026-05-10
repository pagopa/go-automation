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
  private readonly queue: GOConcurrencyPoolReleaseFn[] = [];

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
   * Resolves once the pool has no in-flight or queued tasks.
   */
  public async drain(): Promise<void> {
    while (this.active > 0 || this.queue.length > 0) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }
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
    return this.queue.length;
  }

  private async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next !== undefined) {
      next();
    }
  }
}
