import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GODefaultSleeper } from '../GODefaultSleeper.js';
import { pollingErrorOfKind } from './helpers/pollingErrorOfKind.js';

/** Lets pending promise callbacks run without advancing the mocked clock. */
async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('GODefaultSleeper', () => {
  it('resolves only once the requested delay has elapsed, then ignores a later abort', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const controller = new AbortController();
    let resolved = false;
    const sleepPromise = new GODefaultSleeper().sleep(20, controller.signal).then(() => {
      resolved = true;
    });

    t.mock.timers.tick(19);
    await flushMicrotasks();
    assert.strictEqual(resolved, false, 'still sleeping before the delay');

    t.mock.timers.tick(1);
    await sleepPromise;
    assert.strictEqual(resolved, true);
    // The abort listener was removed on resolve: aborting now must not throw.
    controller.abort();

    const withoutSignal = new GODefaultSleeper().sleep(5);
    t.mock.timers.tick(5);
    await withoutSignal;
  });

  it('rejects with GOPollingError when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(new GODefaultSleeper().sleep(1000, controller.signal), (error: unknown): boolean => {
      return pollingErrorOfKind('aborted')(error) && /before sleep/i.test((error as Error).message);
    });
  });

  it('rejects as soon as the signal aborts during sleep (does not wait the full delay)', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const controller = new AbortController();
    const sleepPromise = new GODefaultSleeper().sleep(5000, controller.signal);

    controller.abort();

    await assert.rejects(sleepPromise, (error: unknown): boolean => {
      return pollingErrorOfKind('aborted')(error) && /during sleep/i.test((error as Error).message);
    });
  });
});
