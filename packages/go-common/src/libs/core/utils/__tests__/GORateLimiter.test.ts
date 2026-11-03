import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GORateLimiter } from '../GORateLimiter.js';
import type { GOSleeper } from '../../polling/GOSleeper.js';

/**
 * Fake time: `sleep` advances the clock without waiting. The advance happens
 * on the next macrotask, so the continuations of permits already granted run
 * (and read the clock) before time moves on.
 */
class FakeTime implements GOSleeper {
  public current = 0;

  public readonly now = (): number => this.current;

  async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    this.current += ms;
  }
}

function createLimiter(time: FakeTime, ratePerSecond: number, burst = 1, priorities = 1): GORateLimiter {
  return new GORateLimiter({ ratePerSecond, burst, priorities, sleeper: time, now: time.now });
}

describe('GORateLimiter', () => {
  it('spaces permits uniformly with burst 1', async () => {
    const time = new FakeTime();
    const limiter = createLimiter(time, 20);
    const grantedAt: number[] = [];

    await Promise.all(
      Array.from({ length: 100 }, async () => {
        await limiter.acquire();
        grantedAt.push(time.current);
      }),
    );

    assert.equal(grantedAt.length, 100);
    assert.equal(grantedAt[0], 0, 'first permit is immediate');
    assert.equal(grantedAt[99], 99 * 50, '100 permits at 20/s take 4.95 s');
    for (let i = 1; i < grantedAt.length; i++) {
      assert.equal((grantedAt[i] ?? 0) - (grantedAt[i - 1] ?? 0), 50);
    }
  });

  it('never exceeds rate + 1 permits in any one-second window', async () => {
    const time = new FakeTime();
    const limiter = createLimiter(time, 20);
    const grantedAt: number[] = [];

    await Promise.all(
      Array.from({ length: 200 }, async () => {
        await limiter.acquire();
        grantedAt.push(time.current);
      }),
    );

    let start = 0;
    for (let end = 0; end < grantedAt.length; end++) {
      while ((grantedAt[end] ?? 0) - (grantedAt[start] ?? 0) >= 1000) start++;
      assert.ok(end - start + 1 <= 21, `window ending at ${grantedAt[end]} has ${end - start + 1} permits`);
    }
  });

  it('allows an initial burst equal to the bucket capacity', async () => {
    const time = new FakeTime();
    const limiter = createLimiter(time, 10, 5);
    const grantedAt: number[] = [];

    await Promise.all(
      Array.from({ length: 7 }, async () => {
        await limiter.acquire();
        grantedAt.push(time.current);
      }),
    );

    assert.deepEqual(grantedAt, [0, 0, 0, 0, 0, 100, 200]);
  });

  it('refills over idle time up to the burst only', async () => {
    const time = new FakeTime();
    const limiter = createLimiter(time, 10, 2);
    await limiter.acquire();
    await limiter.acquire();
    time.current += 10_000; // long idle: refill capped at 2

    const grantedAt: number[] = [];
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        await limiter.acquire();
        grantedAt.push(time.current);
      }),
    );

    assert.deepEqual(grantedAt, [10_000, 10_000, 10_100]);
  });

  it('serves higher priorities first, FIFO within a priority', async () => {
    const time = new FakeTime();
    const limiter = createLimiter(time, 10, 1, 2);
    const order: string[] = [];

    await limiter.acquire(0); // consume the initial token so everything below queues
    const pending = [
      limiter.acquire(1).then(() => order.push('low-1')),
      limiter.acquire(1).then(() => order.push('low-2')),
      limiter.acquire(0).then(() => order.push('high-1')),
      limiter.acquire(0).then(() => order.push('high-2')),
    ];
    await Promise.all(pending);

    assert.deepEqual(order, ['high-1', 'high-2', 'low-1', 'low-2']);
  });

  it('does not let a new caller overtake queued callers', async () => {
    const time = new FakeTime();
    const limiter = createLimiter(time, 10);
    const order: string[] = [];

    await limiter.acquire();
    const first = limiter.acquire().then(() => order.push('queued'));
    time.current += 100; // a token is now available, but someone is waiting
    const second = limiter.acquire().then(() => order.push('late'));
    await Promise.all([first, second]);

    assert.deepEqual(order, ['queued', 'late']);
  });

  it('rejects an already aborted signal without consuming a permit', async () => {
    const time = new FakeTime();
    const limiter = createLimiter(time, 10);
    const controller = new AbortController();
    controller.abort(new Error('stop'));

    await assert.rejects(limiter.acquire(0, controller.signal), /stop/);
    await limiter.acquire();
    assert.equal(time.current, 0, 'the initial token was still available');
    assert.equal(limiter.stats.granted, 1);
  });

  it('removes an aborted waiter from the queue', async () => {
    const time = new FakeTime();
    const limiter = createLimiter(time, 10);
    const controller = new AbortController();

    await limiter.acquire();
    const aborted = limiter.acquire(0, controller.signal);
    const kept = limiter.acquire();
    controller.abort();

    await assert.rejects(aborted);
    await kept;
    assert.equal(time.current, 100, 'the surviving waiter got the next token');
    assert.equal(limiter.stats.aborted, 1);
    assert.equal(limiter.stats.queued, 0);
  });

  it('applies setRate to callers already queued', async () => {
    const time = new FakeTime();
    const limiter = createLimiter(time, 10);
    const grantedAt: number[] = [];

    await limiter.acquire();
    const pending = Array.from({ length: 3 }, async () => {
      await limiter.acquire();
      grantedAt.push(time.current);
    });
    limiter.setRate(2);
    await Promise.all(pending);

    assert.equal(limiter.ratePerSecond, 2);
    assert.deepEqual(grantedAt, [500, 1000, 1500]);
  });

  it('reports stats', async () => {
    const time = new FakeTime();
    const limiter = createLimiter(time, 10, 1, 2);

    await Promise.all([limiter.acquire(0), limiter.acquire(1), limiter.acquire(1)]);

    const stats = limiter.stats;
    assert.equal(stats.granted, 3);
    assert.equal(stats.queued, 0);
    assert.deepEqual(stats.queuedByPriority, [0, 0]);
    assert.equal(stats.maxWaitMs, 200);
    assert.equal(stats.averageWaitMs, 100);
  });

  it('validates options and priority', async () => {
    assert.throws(() => new GORateLimiter({ ratePerSecond: 0 }), /ratePerSecond/);
    assert.throws(() => new GORateLimiter({ ratePerSecond: 1, burst: 0 }), /burst/);
    assert.throws(() => new GORateLimiter({ ratePerSecond: 1, priorities: 1.5 }), /priorities/);
    const limiter = new GORateLimiter({ ratePerSecond: 1 });
    await assert.rejects(limiter.acquire(1), /priority/);
    assert.throws(() => limiter.setRate(-1), /ratePerSecond/);
  });

  it('works with the real clock and sleeper', async () => {
    const limiter = new GORateLimiter({ ratePerSecond: 100 });
    const started = performance.now();
    await Promise.all(Array.from({ length: 5 }, async () => limiter.acquire()));
    assert.ok(performance.now() - started >= 35, 'four waits of ~10 ms each');
  });
});
