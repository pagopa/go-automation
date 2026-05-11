import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOConcurrencyPool } from '../GOConcurrencyPool.js';

async function waitUntil(predicate: () => boolean, description: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.fail(`Timed out waiting for ${description}`);
}

describe('GOConcurrencyPool', () => {
  it('rejects invalid limits', () => {
    assert.throws(() => new GOConcurrencyPool(0), /positive integer/);
    assert.throws(() => new GOConcurrencyPool(-1), /positive integer/);
    assert.throws(() => new GOConcurrencyPool(1.5), /positive integer/);
  });

  it('limits in-flight tasks to the configured concurrency', async () => {
    const pool = new GOConcurrencyPool(3);
    let active = 0;
    let peak = 0;

    const tasks = Array.from({ length: 20 }, async () =>
      pool.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return 'ok';
      }),
    );

    const results = await Promise.all(tasks);
    assert.strictEqual(results.length, 20);
    assert.ok(peak <= 3, `expected peak <= 3, got ${peak}`);
    assert.strictEqual(active, 0);
  });

  it('propagates task errors via run()', async () => {
    const pool = new GOConcurrencyPool(1);
    await assert.rejects(
      pool.run(async () => Promise.reject(new Error('boom'))),
      /boom/,
    );
  });

  it('drain resolves once the pool is empty', async () => {
    const pool = new GOConcurrencyPool(2);
    pool.run(async () => new Promise((resolve) => setTimeout(resolve, 10))).catch(() => undefined);
    pool.run(async () => new Promise((resolve) => setTimeout(resolve, 10))).catch(() => undefined);
    await pool.drain();
    assert.strictEqual(pool.activeCount, 0);
    assert.strictEqual(pool.queuedCount, 0);
  });

  it('drain on an already-idle pool resolves immediately', async () => {
    const pool = new GOConcurrencyPool(2);
    await pool.drain();
    assert.strictEqual(pool.activeCount, 0);
    assert.strictEqual(pool.queuedCount, 0);
  });

  it('drain does not steal slots from acquire waiters', async () => {
    // Regression: when `drain()` was implemented by sharing the acquire
    // queue, calling `run()` after `drain()` (with the pool saturated)
    // would deadlock — the drain waiter consumed the first release, the
    // queued task was never woken, and the drain loop re-parked forever.
    const pool = new GOConcurrencyPool(1);
    let task1Done = false;
    let task2Done = false;

    const task1 = pool.run(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      task1Done = true;
    });

    // Drain BEFORE the second run is even submitted — the bug needs the
    // drain to be waiting when the new run arrives.
    const drainPromise = pool.drain();

    // Submit AFTER drain is awaiting.
    const task2 = pool.run(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      task2Done = true;
    });

    // All three must resolve in finite time.
    await Promise.race([
      Promise.all([task1, task2, drainPromise]),
      new Promise((_, reject) => setTimeout(() => reject(new Error('deadlock: pool never drained')), 1000)),
    ]);

    assert.ok(task1Done, 'task1 should have completed');
    assert.ok(task2Done, 'task2 should have completed');
    assert.strictEqual(pool.activeCount, 0);
    assert.strictEqual(pool.queuedCount, 0);
  });

  it('multiple concurrent drain() calls all resolve together', async () => {
    const pool = new GOConcurrencyPool(1);
    pool.run(async () => new Promise((resolve) => setTimeout(resolve, 10))).catch(() => undefined);

    const drains = [pool.drain(), pool.drain(), pool.drain()];
    await Promise.all(drains);
    assert.strictEqual(pool.activeCount, 0);
    assert.strictEqual(pool.queuedCount, 0);
  });

  it('runEach applies producer backpressure before consuming the next item', async () => {
    const pool = new GOConcurrencyPool(2);
    const yielded: number[] = [];
    const started: number[] = [];
    const releases = new Map<number, () => void>();

    async function* items(): AsyncIterableIterator<number> {
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
    assert.deepStrictEqual(started, [1, 2]);

    releases.get(1)?.();
    await waitUntil(() => started.length === 3, 'third worker to start');
    assert.deepStrictEqual(yielded, [1, 2, 3]);
    assert.deepStrictEqual(started, [1, 2, 3]);

    releases.get(2)?.();
    releases.get(3)?.();
    await runPromise;
    assert.strictEqual(pool.activeCount, 0);
    assert.strictEqual(pool.queuedCount, 0);
  });

  it('runEach stops consuming new items after a worker error and rethrows it', async () => {
    const pool = new GOConcurrencyPool(2);
    const started: number[] = [];
    const boom = new Error('boom');

    await assert.rejects(
      pool.runEach([1, 2, 3], async (item) => {
        started.push(item);
        if (item === 1) throw boom;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }),
      (error: unknown): boolean => error === boom,
    );

    assert.deepStrictEqual(started, [1, 2]);
    assert.strictEqual(pool.activeCount, 0);
    assert.strictEqual(pool.queuedCount, 0);
  });
});
