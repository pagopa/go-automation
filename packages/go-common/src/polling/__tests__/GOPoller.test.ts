import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOBackoff } from '../GOBackoff.js';
import { GOPoller } from '../GOPoller.js';
import type { GOPollAttemptInfo } from '../GOPollAttemptInfo.js';
import type { GOSleeper } from '../GOSleeper.js';
import { RecordingSleeper } from './helpers/RecordingSleeper.js';
import { pollingErrorOfKind } from './helpers/pollingErrorOfKind.js';

/** Custom domain error subclass to verify type preservation. */
class CustomDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'CustomDomainError';
  }
}

describe('GOPoller', () => {
  it("returns the value of the first 'success' decision and stops invoking the check", async () => {
    const sleeper = new RecordingSleeper();
    const poller = new GOPoller({ maxAttempts: 5, sleeper, backoff: GOBackoff.constant(1) });

    let calls = 0;
    const result = await poller.poll(async () => {
      calls++;
      await Promise.resolve();
      if (calls < 3) return { type: 'continue' as const };
      return { type: 'success' as const, value: 'ok' };
    });

    assert.strictEqual(result, 'ok');
    assert.strictEqual(calls, 3, 'check called exactly 3 times');
    assert.deepStrictEqual(sleeper.calls, [1, 1], 'slept twice between three checks');
  });

  it("times out after maxAttempts on 'continue', reporting each attempt to the check and onAttempt", async () => {
    const sleeper = new RecordingSleeper();
    const events: GOPollAttemptInfo[] = [];
    const seenAttempts: number[] = [];
    const poller = new GOPoller({
      maxAttempts: 3,
      sleeper,
      backoff: GOBackoff.constant(5),
      onAttempt: (info) => events.push(info),
    });

    await assert.rejects(
      poller.poll(async (attempt) => {
        seenAttempts.push(attempt);
        return Promise.resolve({ type: 'continue' as const });
      }),
      pollingErrorOfKind('timeout'),
    );

    assert.deepStrictEqual(seenAttempts, [0, 1, 2]);
    // 3 attempts → 2 sleeps (the last attempt has no "next").
    assert.deepStrictEqual(sleeper.calls, [5, 5]);
    assert.deepStrictEqual(
      events.map(({ attempt, nextDelayMs, reason, progress }) => ({ attempt, nextDelayMs, reason, progress })),
      [
        { attempt: 0, nextDelayMs: 5, reason: undefined, progress: undefined },
        { attempt: 1, nextDelayMs: 5, reason: undefined, progress: undefined },
      ],
    );
    assert.strictEqual(typeof events[0]?.elapsedMs, 'number');
  });

  it("propagates 'reason' and 'progress' from continue decisions to onAttempt", async () => {
    const events: GOPollAttemptInfo[] = [];
    const poller = new GOPoller({
      maxAttempts: 3,
      sleeper: new RecordingSleeper(),
      backoff: GOBackoff.constant(1),
      onAttempt: (info) => events.push(info),
    });

    await assert.rejects(
      poller.poll(async (attempt) =>
        Promise.resolve({
          type: 'continue' as const,
          reason: `state-${String(attempt + 1)}`,
          progress: { count: (attempt + 1) * 10 },
        }),
      ),
      pollingErrorOfKind('timeout'),
    );

    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0]?.reason, 'state-1');
    assert.deepStrictEqual(events[0]?.progress, { count: 10 });
    assert.strictEqual(events[1]?.reason, 'state-2');
  });

  it("propagates the error of a 'failure' decision as-is, without retrying", async () => {
    const sleeper = new RecordingSleeper();
    const poller = new GOPoller({ maxAttempts: 5, sleeper, backoff: GOBackoff.constant(1) });
    const domainError = new CustomDomainError('terminal', 'E_TERMINAL');

    let calls = 0;
    await assert.rejects(
      poller.poll<unknown, CustomDomainError>(async () => {
        calls++;
        await Promise.resolve();
        return { type: 'failure' as const, error: domainError, reason: 'REFUSED' };
      }),
      (e: unknown): boolean => e === domainError && e instanceof CustomDomainError && e.code === 'E_TERMINAL',
    );
    assert.strictEqual(calls, 1, 'no retry after a failure');
    assert.deepStrictEqual(sleeper.calls, [], 'no sleep after failure');
  });

  it("propagates a thrown exception from the check as-is (distinct from a 'failure' decision)", async () => {
    const poller = new GOPoller({ sleeper: new RecordingSleeper(), backoff: GOBackoff.constant(1) });
    const surprise = new Error('network glitch');

    await assert.rejects(
      poller.poll(async () => {
        await Promise.resolve();
        throw surprise;
      }),
      (e: unknown): boolean => e === surprise, // same reference, NOT wrapped
    );
  });

  it('maxAttempts=0 throws GOPollingError(kind: timeout) without invoking the check', async () => {
    const poller = new GOPoller({ maxAttempts: 0, backoff: GOBackoff.constant(1) });
    let calls = 0;
    await assert.rejects(
      poller.poll(async () => {
        calls++;
        return Promise.resolve({ type: 'success' as const, value: 'never' });
      }),
      pollingErrorOfKind('timeout'),
    );
    assert.strictEqual(calls, 0);
  });

  it('throws GOPollingError(kind: aborted) when signal is already aborted at start', async () => {
    const controller = new AbortController();
    controller.abort();
    const poller = new GOPoller({ signal: controller.signal });

    await assert.rejects(
      poller.poll(async () => Promise.resolve({ type: 'success' as const, value: 'never' })),
      pollingErrorOfKind('aborted'),
    );
  });

  it('aborts during sleep without waiting the full delay', async () => {
    // Real GODefaultSleeper to exercise the abort-during-sleep path.
    const controller = new AbortController();
    const poller = new GOPoller({
      maxAttempts: 10,
      backoff: GOBackoff.constant(5000),
      signal: controller.signal,
    });

    const start = Date.now();
    const promise = poller.poll(async () => Promise.resolve({ type: 'continue' as const }));
    setImmediate(() => controller.abort());

    await assert.rejects(promise, pollingErrorOfKind('aborted'));
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 1000, `expected fast abort, took ${String(elapsed)}ms`);
  });

  it('throws GOPollingError(kind: budget-exceeded) when maxElapsedMs is exceeded', async (t) => {
    t.mock.timers.enable({ apis: ['Date'] });
    // Sleeper that advances the mocked clock instead of waiting.
    const sleeper: GOSleeper = {
      sleep: async (ms) => {
        t.mock.timers.tick(ms);
        return Promise.resolve();
      },
    };
    const poller = new GOPoller({
      maxAttempts: 100,
      sleeper,
      backoff: GOBackoff.constant(30),
      maxElapsedMs: 50,
    });

    let calls = 0;
    await assert.rejects(
      poller.poll(async () => {
        calls++;
        return Promise.resolve({ type: 'continue' as const });
      }),
      pollingErrorOfKind('budget-exceeded'),
    );
    // Checks at t=0 and t=30 run; the check at t=60 exceeds the 50ms budget.
    assert.strictEqual(calls, 2);
  });

  it('invokes the backoff with the GOBackoffContext (attempt, previousDelayMs)', async () => {
    const sleeper = new RecordingSleeper();
    const seen: { attempt: number; prev: number | undefined }[] = [];
    const backoff = ({ attempt, previousDelayMs }: { attempt: number; previousDelayMs?: number }): number => {
      seen.push({ attempt, prev: previousDelayMs });
      return 100 * (attempt + 1);
    };
    const poller = new GOPoller({ maxAttempts: 4, sleeper, backoff });

    await assert.rejects(
      poller.poll(async () => Promise.resolve({ type: 'continue' as const })),
      pollingErrorOfKind('timeout'),
    );

    assert.deepStrictEqual(seen, [
      { attempt: 0, prev: undefined },
      { attempt: 1, prev: 100 },
      { attempt: 2, prev: 200 },
    ]);
    assert.deepStrictEqual(sleeper.calls, [100, 200, 300]);
  });

  it('per-run isolation: two concurrent poll() calls on the SAME instance share no previousDelayMs', async () => {
    const observedPrev: (number | undefined)[] = [];
    const backoff = ({ previousDelayMs }: { attempt: number; previousDelayMs?: number }): number => {
      observedPrev.push(previousDelayMs);
      return 50;
    };

    // Sleeper that yields to the event loop so the two polls interleave.
    const interleavingSleeper: GOSleeper = {
      async sleep(): Promise<void> {
        await new Promise<void>((resolve) => setImmediate(resolve));
      },
    };

    const poller = new GOPoller({ maxAttempts: 3, backoff, sleeper: interleavingSleeper });

    await Promise.allSettled([
      poller.poll(async () => Promise.resolve({ type: 'continue' as const })),
      poller.poll(async () => Promise.resolve({ type: 'continue' as const })),
    ]);

    // Each poll: 3 attempts → 2 backoff calls seeing [undefined, 50].
    assert.deepStrictEqual(
      [...observedPrev].sort(), // sort() places undefined last
      [50, 50, undefined, undefined],
    );
  });
});
