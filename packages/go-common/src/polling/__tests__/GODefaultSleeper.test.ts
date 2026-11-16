import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GODefaultSleeper } from '../GODefaultSleeper.js';
import { GOPollingError } from '../GOPollingError.js';

describe('GODefaultSleeper', () => {
  it('resolves after the requested delay', async () => {
    const sleeper = new GODefaultSleeper();
    const start = Date.now();
    await sleeper.sleep(20);
    const elapsed = Date.now() - start;
    // Allow some scheduler slack but ensure we waited at least most of the requested time.
    assert.ok(elapsed >= 15, `expected elapsed >= 15ms, got ${elapsed}ms`);
    assert.ok(elapsed < 200, `expected elapsed < 200ms, got ${elapsed}ms`);
  });

  it('rejects synchronously with GOPollingError when signal is already aborted', async () => {
    const sleeper = new GODefaultSleeper();
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      sleeper.sleep(1000, controller.signal),
      (error: unknown): boolean =>
        error instanceof GOPollingError && error.kind === 'aborted' && /before sleep/i.test(error.message),
    );
  });

  it('rejects immediately when signal aborts during sleep (does not wait the full delay)', async () => {
    const sleeper = new GODefaultSleeper();
    const controller = new AbortController();

    const start = Date.now();
    const sleepPromise = sleeper.sleep(5000, controller.signal);

    // Abort after a few ms — the sleep MUST reject in close to that time,
    // not after the full 5000ms.
    setTimeout(() => controller.abort(), 10);

    await assert.rejects(
      sleepPromise,
      (error: unknown): boolean =>
        error instanceof GOPollingError && error.kind === 'aborted' && /during sleep/i.test(error.message),
    );

    const elapsed = Date.now() - start;
    assert.ok(elapsed < 500, `expected fast abort, took ${elapsed}ms`);
  });

  it('resolves normally when an unaborted signal is provided', async () => {
    const sleeper = new GODefaultSleeper();
    const controller = new AbortController();
    await sleeper.sleep(15, controller.signal);
    // If we got here, the abort listener was correctly removed on resolve
    // (otherwise we'd potentially leak listeners). Sanity check by aborting
    // post-resolve: must not throw.
    controller.abort();
  });

  it('zero-ms sleep resolves on the next tick', async () => {
    const sleeper = new GODefaultSleeper();
    const start = Date.now();
    await sleeper.sleep(0);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 100, `expected near-immediate resolve, took ${elapsed}ms`);
  });
});
