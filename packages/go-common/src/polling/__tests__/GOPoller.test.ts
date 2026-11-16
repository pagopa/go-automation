import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOBackoff } from '../GOBackoff.js';
import { GOPoller } from '../GOPoller.js';
import { GOPollingError } from '../GOPollingError.js';
import type { GOPollAttemptInfo } from '../GOPollAttemptInfo.js';
import type { GOSleeper } from '../GOSleeper.js';

/** Fake sleeper that records delays and resolves immediately. */
class RecordingSleeper implements GOSleeper {
  public readonly calls: number[] = [];

  async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted === true) {
      throw new GOPollingError('aborted', 'Aborted before sleep');
    }
    this.calls.push(ms);
    await Promise.resolve();
  }
}

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
  // ── Decision: success ────────────────────────────────────────────────────

  it("returns the value from a 'success' decision", async () => {
    const sleeper = new RecordingSleeper();
    const poller = new GOPoller({ sleeper, backoff: GOBackoff.constant(1) });

    const result = await poller.poll(async () => Promise.resolve({ type: 'success' as const, value: 42 }));

    assert.strictEqual(result, 42);
    assert.deepStrictEqual(sleeper.calls, [], 'no sleep when success on first check');
  });

  it('stops invoking the check after the success', async () => {
    const sleeper = new RecordingSleeper();
    const poller = new GOPoller({ maxAttempts: 5, sleeper, backoff: GOBackoff.constant(1) });

    let calls = 0;
    await poller.poll(async () => {
      calls++;
      await Promise.resolve();
      if (calls < 3) return { type: 'continue' as const };
      return { type: 'success' as const, value: 'ok' };
    });

    assert.strictEqual(calls, 3, 'check called exactly 3 times');
    assert.deepStrictEqual(sleeper.calls, [1, 1], 'slept twice between three checks');
  });

  // ── Decision: continue ───────────────────────────────────────────────────

  it("times out after maxAttempts when the check keeps returning 'continue'", async () => {
    const sleeper = new RecordingSleeper();
    const poller = new GOPoller({ maxAttempts: 3, sleeper, backoff: GOBackoff.constant(5) });

    await assert.rejects(
      poller.poll(async () => Promise.resolve({ type: 'continue' as const })),
      (e: unknown): boolean => e instanceof GOPollingError && e.kind === 'timeout',
    );
    // 3 attempts → 2 sleeps (the last attempt has no "next").
    assert.deepStrictEqual(sleeper.calls, [5, 5]);
  });

  it("propagates 'reason' and 'progress' from continue decisions to onAttempt", async () => {
    const events: GOPollAttemptInfo[] = [];
    const sleeper = new RecordingSleeper();
    const poller = new GOPoller({
      maxAttempts: 3,
      sleeper,
      backoff: GOBackoff.constant(1),
      onAttempt: (info) => events.push(info),
    });

    let calls = 0;
    await assert.rejects(
      poller.poll(async () => {
        calls++;
        await Promise.resolve();
        return {
          type: 'continue' as const,
          reason: `state-${String(calls)}`,
          progress: { count: calls * 10 },
        };
      }),
      (e: unknown): boolean => e instanceof GOPollingError && e.kind === 'timeout',
    );

    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0]?.reason, 'state-1');
    assert.deepStrictEqual(events[0]?.progress, { count: 10 });
    assert.strictEqual(events[1]?.reason, 'state-2');
  });

  it('works without reason/progress (continue decision with no extras)', async () => {
    const events: GOPollAttemptInfo[] = [];
    const sleeper = new RecordingSleeper();
    const poller = new GOPoller({
      maxAttempts: 2,
      sleeper,
      backoff: GOBackoff.constant(1),
      onAttempt: (info) => events.push(info),
    });

    await assert.rejects(
      poller.poll(async () => Promise.resolve({ type: 'continue' as const })),
      (e: unknown): boolean => e instanceof GOPollingError && e.kind === 'timeout',
    );

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0]?.reason, undefined);
    assert.strictEqual(events[0]?.progress, undefined);
  });

  // ── Decision: failure ────────────────────────────────────────────────────

  it("propagates the error from a 'failure' decision (kept as-is)", async () => {
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
      (e: unknown): boolean => e === domainError,
    );
    assert.strictEqual(calls, 1, 'no retry after a failure');
    assert.deepStrictEqual(sleeper.calls, [], 'no sleep after failure');
  });

  it('preserves the original error subclass through failure (instanceof check)', async () => {
    const sleeper = new RecordingSleeper();
    const poller = new GOPoller({ sleeper, backoff: GOBackoff.constant(1) });
    const domainError = new CustomDomainError('terminal', 'E_TERMINAL');

    try {
      await poller.poll<unknown, CustomDomainError>(async () =>
        Promise.resolve({ type: 'failure' as const, error: domainError }),
      );
      assert.fail('expected the poll to reject');
    } catch (e) {
      assert.ok(e instanceof CustomDomainError, 'error type preserved');
      assert.strictEqual(e.code, 'E_TERMINAL');
    }
  });

  // ── Throw distinct from failure ──────────────────────────────────────────

  it("propagates a thrown exception from the check as-is (distinct from a 'failure' decision)", async () => {
    const sleeper = new RecordingSleeper();
    const poller = new GOPoller({ sleeper, backoff: GOBackoff.constant(1) });
    const surprise = new Error('network glitch');

    await assert.rejects(
      poller.poll(async () => {
        await Promise.resolve();
        throw surprise;
      }),
      (e: unknown): boolean => e === surprise, // same reference, NOT wrapped
    );
  });

  it('distinguishes GOPollingError (infra) from domain failure from thrown exception (three channels)', async () => {
    const sleeper = new RecordingSleeper();
    const poller = new GOPoller({ maxAttempts: 1, sleeper, backoff: GOBackoff.constant(1) });

    // Channel 1: GOPollingError on timeout
    await assert.rejects(
      poller.poll(async () => Promise.resolve({ type: 'continue' as const })),
      (e: unknown): boolean => e instanceof GOPollingError && e.kind === 'timeout',
    );

    // Channel 2: domain failure (CustomDomainError, not wrapped)
    const domainError = new CustomDomainError('boom', 'E_DOMAIN');
    await assert.rejects(
      poller.poll<unknown, CustomDomainError>(async () =>
        Promise.resolve({ type: 'failure' as const, error: domainError }),
      ),
      (e: unknown): boolean => e instanceof CustomDomainError && !(e instanceof GOPollingError),
    );

    // Channel 3: thrown exception (plain Error, not wrapped)
    const surprise = new Error('unexpected');
    await assert.rejects(
      poller.poll(async () => {
        await Promise.resolve();
        throw surprise;
      }),
      (e: unknown): boolean => e === surprise,
    );
  });

  // ── Abort / Budget ───────────────────────────────────────────────────────

  it('throws GOPollingError(kind: aborted) when signal is already aborted at start', async () => {
    const controller = new AbortController();
    controller.abort();
    const poller = new GOPoller({ signal: controller.signal });

    await assert.rejects(
      poller.poll(async () => Promise.resolve({ type: 'success' as const, value: 'never' })),
      (e: unknown): boolean => e instanceof GOPollingError && e.kind === 'aborted',
    );
  });

  it('aborts during sleep without waiting the full delay', async () => {
    // Use the real GODefaultSleeper to exercise the abort-during-sleep path.
    const controller = new AbortController();
    const poller = new GOPoller({
      maxAttempts: 10,
      backoff: GOBackoff.constant(5000),
      signal: controller.signal,
    });

    const start = Date.now();
    const promise = poller.poll(async () => Promise.resolve({ type: 'continue' as const }));
    setTimeout(() => controller.abort(), 20);

    await assert.rejects(promise, (e: unknown): boolean => e instanceof GOPollingError && e.kind === 'aborted');
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 1000, `expected fast abort, took ${String(elapsed)}ms`);
  });

  it('throws GOPollingError(kind: budget-exceeded) when maxElapsedMs is exceeded', async () => {
    class RealSleeper implements GOSleeper {
      async sleep(ms: number): Promise<void> {
        await new Promise<void>((resolve) => setTimeout(resolve, ms));
      }
    }
    const poller = new GOPoller({
      maxAttempts: 100,
      sleeper: new RealSleeper(),
      backoff: GOBackoff.constant(30),
      maxElapsedMs: 50,
    });

    await assert.rejects(
      poller.poll(async () => Promise.resolve({ type: 'continue' as const })),
      (e: unknown): boolean => e instanceof GOPollingError && e.kind === 'budget-exceeded',
    );
  });

  // ── Backoff context and telemetry ────────────────────────────────────────

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
      (e: unknown): boolean => e instanceof GOPollingError && e.kind === 'timeout',
    );

    // 4 attempts → 3 backoff calls (and 3 sleeps).
    assert.deepStrictEqual(
      seen,
      [
        { attempt: 0, prev: undefined },
        { attempt: 1, prev: 100 },
        { attempt: 2, prev: 200 },
      ],
      'previousDelayMs carries the delay from the previous attempt',
    );
    assert.deepStrictEqual(sleeper.calls, [100, 200, 300]);
  });

  it('passes attempt index to the check', async () => {
    const sleeper = new RecordingSleeper();
    const poller = new GOPoller({ maxAttempts: 4, sleeper, backoff: GOBackoff.constant(1) });
    const seen: number[] = [];

    await assert.rejects(
      poller.poll(async (attempt) => {
        seen.push(attempt);
        await Promise.resolve();
        return { type: 'continue' as const };
      }),
      (e: unknown): boolean => e instanceof GOPollingError && e.kind === 'timeout',
    );

    assert.deepStrictEqual(seen, [0, 1, 2, 3]);
  });

  // ── Per-run isolation ────────────────────────────────────────────────────

  it('per-run isolation: two concurrent poll() calls on the SAME instance share no previousDelayMs', async () => {
    const observedPrev: (number | undefined)[] = [];
    const backoff = ({ previousDelayMs }: { attempt: number; previousDelayMs?: number }): number => {
      observedPrev.push(previousDelayMs);
      return 50;
    };

    const interleavingSleeper: GOSleeper = {
      async sleep(): Promise<void> {
        await new Promise<void>((resolve) => setImmediate(resolve));
      },
    };

    const poller = new GOPoller({
      maxAttempts: 3,
      backoff,
      sleeper: interleavingSleeper,
    });

    const promiseA = poller.poll(async () => Promise.resolve({ type: 'continue' as const }));
    const promiseB = poller.poll(async () => Promise.resolve({ type: 'continue' as const }));

    await Promise.allSettled([promiseA, promiseB]);

    // 2 polls × 3 attempts → 4 backoff calls (2 per poll, the third attempt
    // is terminal and doesn't sleep).
    assert.strictEqual(observedPrev.length, 4);
    // Each poll must see its OWN sequence: [undefined, 50]. With per-run
    // state, the global trace has exactly 2 undefined + 2 fifty regardless
    // of interleaving. Without it, one poll would see [50, 50].
    const undefinedCount = observedPrev.filter((v) => v === undefined).length;
    const fiftyCount = observedPrev.filter((v) => v === 50).length;
    assert.strictEqual(undefinedCount, 2);
    assert.strictEqual(fiftyCount, 2);
  });

  // ── onAttempt details ────────────────────────────────────────────────────

  it('onAttempt carries attempt, elapsedMs, nextDelayMs', async () => {
    const sleeper = new RecordingSleeper();
    const events: GOPollAttemptInfo[] = [];
    const poller = new GOPoller({
      maxAttempts: 3,
      sleeper,
      backoff: GOBackoff.constant(7),
      onAttempt: (info) => events.push(info),
    });

    await assert.rejects(
      poller.poll(async () => Promise.resolve({ type: 'continue' as const })),
      (e: unknown): boolean => e instanceof GOPollingError && e.kind === 'timeout',
    );

    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0]?.attempt, 0);
    assert.strictEqual(events[0]?.nextDelayMs, 7);
    assert.strictEqual(events[1]?.attempt, 1);
    assert.ok(typeof events[0]?.elapsedMs === 'number');
  });

  it('maxAttempts=0 throws GOPollingError(kind: timeout) without invoking the check', async () => {
    const poller = new GOPoller({ maxAttempts: 0, backoff: GOBackoff.constant(1) });
    let calls = 0;
    await assert.rejects(
      poller.poll(async () => {
        calls++;
        return Promise.resolve({ type: 'success' as const, value: 'never' });
      }),
      (e: unknown): boolean => e instanceof GOPollingError && e.kind === 'timeout',
    );
    assert.strictEqual(calls, 0);
  });
});
