import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOConcurrencyPool } from '../GOConcurrencyPool.js';

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
});
