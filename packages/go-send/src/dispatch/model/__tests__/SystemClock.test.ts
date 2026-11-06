import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SystemClock } from '../SystemClock.js';

describe('SystemClock', () => {
  it('returns wall-clock milliseconds', () => {
    const before = Date.now();
    const now = new SystemClock().now();
    assert.ok(now >= before && now <= Date.now());
  });

  it('measures intervals on a monotonic clock, not on the adjustable wall clock', () => {
    const clock = new SystemClock();
    const originalNow = Date.now;
    const first = clock.monotonic();
    try {
      Date.now = (): number => originalNow() - 3_600_000; // system clock set back one hour
      assert.ok(clock.monotonic() >= first, 'monotonic time never goes backwards');
    } finally {
      Date.now = originalNow;
    }
  });

  it('sleeps with real timers and rejects when aborted', async () => {
    const clock = new SystemClock();
    const started = Date.now();
    await clock.sleep(15);
    assert.ok(Date.now() - started >= 10);

    const controller = new AbortController();
    const pending = clock.sleep(10_000, controller.signal);
    controller.abort();
    await assert.rejects(pending);
  });
});
