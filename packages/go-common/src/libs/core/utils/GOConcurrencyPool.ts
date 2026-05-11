/**
 * Concurrency-limited task runner.
 *
 * Schedules async tasks so that no more than `limit` are in-flight at the same
 * time. Useful for rate-limiting outbound HTTP requests, parallel file
 * processing, or any I/O-bound workload where unbounded concurrency would
 * saturate the system or trip remote rate limits.
 *
 * The pool preserves submission order for queued tasks (FIFO) and resolves each
 * `run()` call with the value (or rejection) of its task. For large producers,
 * prefer `runEach()`: it applies producer backpressure so memory stays
 * proportional to the concurrency limit instead of the total item count.
 *
 * @example
 * ```typescript
 * await new GOConcurrencyPool(5).runEach(urls, async (url) => {
 *   await fetch(url);
 * });
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

/**
 * Iterable accepted by `GOConcurrencyPool.runEach`.
 */
export type GOConcurrencyPoolIterable<T> = Iterable<T> | AsyncIterable<T>;

/**
 * Worker accepted by `GOConcurrencyPool.runEach`.
 */
export type GOConcurrencyPoolEachTaskFn<T> = (item: T, index: number) => Promise<void>;

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
    return await this.runAcquired(task);
  }

  /**
   * Processes an iterable / async iterable with bounded producer backpressure.
   *
   * Unlike `items.map((item) => pool.run(...))`, this method does not create
   * one promise per input item. It consumes the next item only when a worker
   * slot is available, so queued work and memory usage stay bounded by `limit`.
   *
   * If a worker rejects, no more items are consumed. Already-running workers
   * are allowed to settle, then the original error (or an `AggregateError`) is
   * thrown.
   */
  public async runEach<T>(items: GOConcurrencyPoolIterable<T>, task: GOConcurrencyPoolEachTaskFn<T>): Promise<void> {
    const iterator = toAsyncIterator(items);
    const activeTasks = new Set<Promise<void>>();
    const failures: unknown[] = [];
    let index = 0;

    try {
      while (failures.length === 0) {
        await this.waitForTrackedTaskSlot(activeTasks);
        if (failures.length > 0) break;

        const nextItem = await iterator.next();
        if (nextItem.done === true) break;

        const itemIndex = index;
        index += 1;
        const activeTask = this.startTrackedTask(async () => task(nextItem.value, itemIndex)).catch(
          (error: unknown) => {
            failures.push(error);
          },
        );
        activeTasks.add(activeTask);
        void activeTask.finally(() => {
          activeTasks.delete(activeTask);
        });
      }
    } finally {
      if (failures.length > 0 && iterator.return !== undefined) {
        await iterator.return();
      }
    }

    await Promise.all(activeTasks);
    throwIfTaskFailures(failures);
  }

  private async runAcquired<T>(task: GOConcurrencyPoolTaskFn<T>): Promise<T> {
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

  private async waitForTrackedTaskSlot(activeTasks: ReadonlySet<Promise<void>>): Promise<void> {
    if (activeTasks.size < this.limit) return;
    await Promise.race(activeTasks);
  }

  private async startTrackedTask(task: GOConcurrencyPoolTaskFn<void>): Promise<void> {
    await this.acquire();
    return await this.runAcquired(task);
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

function toAsyncIterator<T>(items: GOConcurrencyPoolIterable<T>): AsyncIterator<T> {
  if (Symbol.asyncIterator in items) {
    return items[Symbol.asyncIterator]();
  }

  const iterator = items[Symbol.iterator]();
  return {
    async next(): Promise<IteratorResult<T>> {
      return await Promise.resolve(iterator.next());
    },
    async return(): Promise<IteratorResult<T>> {
      if (iterator.return !== undefined) {
        return await Promise.resolve(iterator.return());
      }
      return await Promise.resolve({ done: true, value: undefined });
    },
  };
}

function throwIfTaskFailures(failures: ReadonlyArray<unknown>): void {
  if (failures.length === 0) return;
  if (failures.length === 1) {
    throw failures[0];
  }
  throw new AggregateError(failures, `${failures.length} concurrency pool task(s) failed`);
}
