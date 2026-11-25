import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOConcurrencyPool } from '../GOConcurrencyPool.js';

/** Yields one macrotask turn so pending promise chains can settle. */
async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

type PredicateFn = () => boolean;

/** Waits (by macrotask turns) until the predicate holds. */
async function waitUntil(predicate: PredicateFn, description: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await nextTurn();
  }
  assert.fail(`Timed out waiting for ${description}`);
}

/** Asserts the pool has nothing running nor queued. */
function assertIdle(pool: GOConcurrencyPool): void {
  assert.strictEqual(pool.activeCount, 0);
  assert.strictEqual(pool.queuedCount, 0);
}

describe('GOConcurrencyPool', () => {
  it('rejects invalid limits', () => {
    for (const limit of [0, -1, 1.5]) {
      assert.throws(() => new GOConcurrencyPool(limit), /positive integer/);
    }
  });

  it('limits in-flight tasks to the configured concurrency', async () => {
    const pool = new GOConcurrencyPool(3);
    let active = 0;
    let peak = 0;

    const results = await Promise.all(
      Array.from({ length: 20 }, async (_, i) =>
        pool.run(async () => {
          active++;
          peak = Math.max(peak, active);
          await nextTurn();
          active--;
          return i;
        }),
      ),
    );

    assert.deepStrictEqual(
      results,
      Array.from({ length: 20 }, (_, i) => i),
    );
    assert.strictEqual(peak, 3);
    assertIdle(pool);
  });

  it('propagates task errors via run()', async () => {
    const pool = new GOConcurrencyPool(1);
    await assert.rejects(
      pool.run(async () => Promise.reject(new Error('boom'))),
      /boom/,
    );
    assertIdle(pool);
  });

  it('drain resolves immediately when idle, and resolves every concurrent waiter once the pool empties', async () => {
    const pool = new GOConcurrencyPool(1);
    await pool.drain();

    const gate = Promise.withResolvers<void>();
    const task = pool.run(async () => gate.promise);
    let drained = 0;
    const drains = [pool.drain(), pool.drain(), pool.drain()].map(async (drain) => {
      await drain;
      drained++;
    });

    await nextTurn();
    assert.strictEqual(drained, 0, 'drain waits for the running task');
    gate.resolve();
    await Promise.all([task, ...drains]);
    assert.strictEqual(drained, 3);
    assertIdle(pool);
  });

  it('drain does not steal slots from acquire waiters', { timeout: 1000 }, async () => {
    // Regression: when `drain()` shared the acquire queue, calling `run()`
    // after `drain()` (with the pool saturated) deadlocked — the drain waiter
    // consumed the first release and the queued task was never woken.
    const pool = new GOConcurrencyPool(1);
    const gate = Promise.withResolvers<void>();

    const task1 = pool.run(async () => gate.promise);
    // Drain BEFORE the second run is submitted: the bug needs a waiting drain.
    const drainPromise = pool.drain();
    const task2 = pool.run(async () => Promise.resolve('task2'));

    gate.resolve();
    const [, task2Result] = await Promise.all([task1, task2, drainPromise]);
    assert.strictEqual(task2Result, 'task2');
    assertIdle(pool);
  });

  it('runEach applies producer backpressure before consuming the next item', async () => {
    const pool = new GOConcurrencyPool(2);
    const yielded: number[] = [];
    const started: number[] = [];
    const releases = new Map<number, () => void>();

    function* items(): IterableIterator<number> {
      for (const item of [1, 2, 3]) {
        yielded.push(item);
        yield item;
      }
    }

    const runPromise = pool.runEach(items(), async (item) => {
      started.push(item);
      await new Promise<void>((resolve) => {
        releases.set(item, resolve);
      });
    });

    await waitUntil(() => started.length === 2, 'first two workers to start');
    assert.deepStrictEqual(yielded, [1, 2]);

    releases.get(1)?.();
    await waitUntil(() => started.length === 3, 'third worker to start');
    assert.deepStrictEqual(yielded, [1, 2, 3]);
    assert.deepStrictEqual(started, [1, 2, 3]);

    releases.get(2)?.();
    releases.get(3)?.();
    await runPromise;
    assertIdle(pool);
  });

  it('runEach stops consuming new items after a worker error and rethrows it', async () => {
    const pool = new GOConcurrencyPool(2);
    const started: number[] = [];
    const boom = new Error('boom');

    await assert.rejects(
      pool.runEach([1, 2, 3], async (item) => {
        started.push(item);
        if (item === 1) throw boom;
        await nextTurn();
      }),
      (error: unknown): boolean => error === boom,
    );

    assert.deepStrictEqual(started, [1, 2]);
    assertIdle(pool);
  });
});
