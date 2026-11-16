import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOBackoff } from '../GOBackoff.js';
import { GOPollingError } from '../GOPollingError.js';
import { GORetryRunner } from '../GORetryRunner.js';
import type { GORetryAttemptInfo } from '../GORetryAttemptInfo.js';
import type { GORetryClassifier } from '../GORetryClassifier.js';
import type { GOSleeper } from '../GOSleeper.js';

/**
 * Fake sleeper that records delays and resolves immediately.
 * Lets tests verify the runner's backoff sequence without real waiting.
 */
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

/** Classifier helper: always returns the given decision. */
function constantClassifier(decision: 'retriable' | 'fatal' | 'unknown'): GORetryClassifier {
  return { classify: () => decision };
}

describe('GORetryRunner', () => {
  it('returns the value on first success without sleeping', async () => {
    const sleeper = new RecordingSleeper();
    const runner = new GORetryRunner({ sleeper, classifier: constantClassifier('retriable') });

    const result = await runner.run(async () => Promise.resolve('ok'));

    assert.strictEqual(result, 'ok');
    assert.deepStrictEqual(sleeper.calls, [], 'no sleep on first success');
  });

  it('retries on retriable errors until success', async () => {
    const sleeper = new RecordingSleeper();
    const runner = new GORetryRunner({
      maxAttempts: 5,
      sleeper,
      backoff: GOBackoff.constant(10),
      classifier: constantClassifier('retriable'),
    });

    let calls = 0;
    const result = await runner.run(async () => {
      calls++;
      await Promise.resolve();
      if (calls < 3) throw new Error('transient');
      return 'eventual-success';
    });

    assert.strictEqual(result, 'eventual-success');
    assert.strictEqual(calls, 3);
    assert.deepStrictEqual(sleeper.calls, [10, 10], 'slept twice between three attempts');
  });

  it('propagates a fatal error immediately without retrying', async () => {
    const sleeper = new RecordingSleeper();
    const runner = new GORetryRunner({
      maxAttempts: 5,
      sleeper,
      classifier: constantClassifier('fatal'),
    });

    let calls = 0;
    const boom = new Error('boom');

    await assert.rejects(
      runner.run(async () => {
        calls++;
        await Promise.resolve();
        throw boom;
      }),
      (e: unknown): boolean => e === boom,
    );
    assert.strictEqual(calls, 1);
    assert.deepStrictEqual(sleeper.calls, [], 'no sleep on fatal');
  });

  it("'unknown' classification defaults to fatal (safety)", async () => {
    const sleeper = new RecordingSleeper();
    const runner = new GORetryRunner({
      maxAttempts: 5,
      sleeper,
      classifier: constantClassifier('unknown'),
      // unknownDecision NOT set → defaults to 'fatal'
    });

    let calls = 0;
    await assert.rejects(
      runner.run(async () => {
        calls++;
        await Promise.resolve();
        throw new Error('mystery');
      }),
      /mystery/,
    );
    assert.strictEqual(calls, 1);
  });

  it("'unknown' classification retries when unknownDecision='retriable'", async () => {
    const sleeper = new RecordingSleeper();
    const runner = new GORetryRunner({
      maxAttempts: 3,
      sleeper,
      backoff: GOBackoff.constant(5),
      classifier: constantClassifier('unknown'),
      unknownDecision: 'retriable',
    });

    let calls = 0;
    await assert.rejects(
      runner.run(async () => {
        calls++;
        await Promise.resolve();
        throw new Error('keep trying');
      }),
      /keep trying/,
    );
    assert.strictEqual(calls, 3, 'all attempts consumed');
    assert.deepStrictEqual(sleeper.calls, [5, 5]);
  });

  it('without classifier, every error is unknown → defaults to fatal', async () => {
    const sleeper = new RecordingSleeper();
    const runner = new GORetryRunner({ sleeper });

    let calls = 0;
    await assert.rejects(
      runner.run(async () => {
        calls++;
        await Promise.resolve();
        throw new Error('no classifier');
      }),
      /no classifier/,
    );
    assert.strictEqual(calls, 1);
  });

  it('throws the last error after exhausting maxAttempts', async () => {
    const sleeper = new RecordingSleeper();
    const runner = new GORetryRunner({
      maxAttempts: 3,
      sleeper,
      backoff: GOBackoff.constant(1),
      classifier: constantClassifier('retriable'),
    });

    let calls = 0;
    await assert.rejects(
      runner.run(async () => {
        calls++;
        await Promise.resolve();
        throw new Error(`attempt-${String(calls)}`);
      }),
      /attempt-3/,
    );
    assert.strictEqual(calls, 3);
    assert.deepStrictEqual(sleeper.calls, [1, 1]);
  });

  it('throws GOPollingError(kind: aborted) when signal is already aborted before the first attempt', async () => {
    const controller = new AbortController();
    controller.abort();
    const runner = new GORetryRunner({ signal: controller.signal });

    await assert.rejects(
      runner.run(async () => Promise.resolve('never')),
      (e: unknown): boolean => e instanceof GOPollingError && e.kind === 'aborted',
    );
  });

  it('aborts during sleep (no need to wait the full delay)', async () => {
    // Use real GODefaultSleeper to exercise the abort-during-sleep path.
    const controller = new AbortController();
    const runner = new GORetryRunner({
      maxAttempts: 5,
      backoff: GOBackoff.constant(5000),
      classifier: constantClassifier('retriable'),
      signal: controller.signal,
    });

    const start = Date.now();
    const promise = runner.run(async () => Promise.reject(new Error('transient')));
    setTimeout(() => controller.abort(), 20);

    await assert.rejects(promise, (e: unknown): boolean => e instanceof GOPollingError && e.kind === 'aborted');
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 1000, `expected fast abort, took ${String(elapsed)}ms`);
  });

  it('throws GOPollingError(kind: budget-exceeded) when maxElapsedMs is exceeded', async () => {
    // Sleeper that actually waits, so elapsed time grows.
    class RealSleeper implements GOSleeper {
      async sleep(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
      }
    }
    const runner = new GORetryRunner({
      maxAttempts: 10,
      sleeper: new RealSleeper(),
      backoff: GOBackoff.constant(30),
      classifier: constantClassifier('retriable'),
      maxElapsedMs: 50,
    });

    await assert.rejects(
      runner.run(async () => Promise.reject(new Error('transient'))),
      (e: unknown): boolean => e instanceof GOPollingError && e.kind === 'budget-exceeded',
    );
  });

  it('invokes onAttempt with attempt, elapsedMs, lastError, nextDelayMs, delayOverridden=false', async () => {
    const sleeper = new RecordingSleeper();
    const events: GORetryAttemptInfo[] = [];
    const runner = new GORetryRunner({
      maxAttempts: 3,
      sleeper,
      backoff: GOBackoff.constant(7),
      classifier: constantClassifier('retriable'),
      onAttempt: (info) => events.push(info),
    });

    await assert.rejects(
      runner.run(async () => Promise.reject(new Error('e'))),
      /e/,
    );

    // 3 attempts → 2 onAttempt calls (the final attempt has no "next" sleep).
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0]?.attempt, 0);
    assert.strictEqual(events[0]?.nextDelayMs, 7);
    assert.strictEqual(events[0]?.delayOverridden, false);
    assert.ok(events[0]?.lastError instanceof Error);
    assert.strictEqual(events[1]?.attempt, 1);
  });

  it("respects classifier's GORetryAdvice.delayMs override and reports delayOverridden=true", async () => {
    const sleeper = new RecordingSleeper();
    const events: GORetryAttemptInfo[] = [];
    const classifier: GORetryClassifier = {
      classify: () => ({ decision: 'retriable', delayMs: 9999 }),
    };
    const runner = new GORetryRunner({
      maxAttempts: 3,
      sleeper,
      backoff: GOBackoff.constant(100), // would be 100 if not overridden
      classifier,
      onAttempt: (info) => events.push(info),
    });

    await assert.rejects(
      runner.run(async () => Promise.reject(new Error('e'))),
      /e/,
    );

    assert.deepStrictEqual(sleeper.calls, [9999, 9999], 'override beats backoff');
    assert.strictEqual(events[0]?.delayOverridden, true);
    assert.strictEqual(events[0]?.nextDelayMs, 9999);
  });

  it('override delayMs does NOT update previousDelayMs (sequence stays coherent)', async () => {
    // Mix: alternate override / no-override and verify that the backoff receives
    // the previousDelayMs that corresponds to the LAST non-overridden delay.
    const sleeper = new RecordingSleeper();
    const seenPreviousDelays: (number | undefined)[] = [];

    // Custom backoff that records what previousDelayMs it sees.
    const backoff = ({ previousDelayMs }: { attempt: number; previousDelayMs?: number }): number => {
      seenPreviousDelays.push(previousDelayMs);
      return 42; // value chosen by backoff each time
    };

    // Classifier alternates: attempt 0 returns override, attempt 1 no override, attempt 2 override.
    let callCount = 0;
    const classifier: GORetryClassifier = {
      classify: () => {
        callCount++;
        if (callCount === 1) return { decision: 'retriable', delayMs: 999 };
        if (callCount === 2) return 'retriable';
        return { decision: 'retriable', delayMs: 888 };
      },
    };

    const runner = new GORetryRunner({
      maxAttempts: 4,
      sleeper,
      backoff,
      classifier,
    });

    await assert.rejects(
      runner.run(async () => Promise.reject(new Error('e'))),
      /e/,
    );

    // Attempt 0 → override 999 (NOT updating previousDelayMs).
    // Attempt 1 → backoff called with previousDelayMs=undefined (override didn't update it) → 42.
    // Attempt 2 → override 888 (NOT updating previousDelayMs).
    // Attempt 3 → terminal; no sleep.
    assert.deepStrictEqual(sleeper.calls, [999, 42, 888]);
    // The single time backoff was called (attempt 1), previousDelayMs must be undefined
    // because attempt 0's delay was an override.
    assert.deepStrictEqual(seenPreviousDelays, [undefined]);
  });

  it('per-run isolation: two concurrent run() calls on the SAME instance share no previousDelayMs', async (t) => {
    // Critical property: if previousDelayMs were stored on `this` (or in the
    // backoff closure), interleaved run() calls would see each other's "last"
    // delay. With per-run state living in the run() local scope, each run's
    // first backoff invocation MUST see previousDelayMs=undefined regardless
    // of what other concurrent runs have done.
    t.mock.method(Math, 'random', () => 0); // deterministic: delays collapse to base

    // Trace every backoff invocation with the previousDelayMs it received.
    const observedPrev: (number | undefined)[] = [];
    const backoff = ({ previousDelayMs }: { attempt: number; previousDelayMs?: number }): number => {
      observedPrev.push(previousDelayMs);
      return 50;
    };

    // Sleeper that yields to the microtask queue so the two runs interleave.
    const interleavingSleeper: GOSleeper = {
      async sleep(): Promise<void> {
        await new Promise<void>((resolve) => setImmediate(resolve));
      },
    };

    // ONE shared runner instance. Both runs use it via the same `.run()` call.
    const runner = new GORetryRunner({
      maxAttempts: 3,
      backoff,
      classifier: constantClassifier('retriable'),
      sleeper: interleavingSleeper,
    });

    const promiseA = runner.run(async () => Promise.reject(new Error('A')));
    const promiseB = runner.run(async () => Promise.reject(new Error('B')));

    await Promise.allSettled([promiseA, promiseB]);

    // Each run does 3 attempts → 2 backoff invocations per run, total 4.
    assert.strictEqual(observedPrev.length, 4, 'expected 4 backoff calls');

    // Without per-run state, one of the two runs would see [50, 50] on its
    // backoff calls because the other run wrote previousDelayMs=50 first.
    // With per-run state, both runs see [undefined, 50] independently, so
    // the GLOBAL trace has exactly 2 undefined and 2 fifties — regardless
    // of interleaving order.
    const undefinedCount = observedPrev.filter((v) => v === undefined).length;
    const fiftyCount = observedPrev.filter((v) => v === 50).length;
    assert.strictEqual(undefinedCount, 2, 'each run starts with previousDelayMs=undefined');
    assert.strictEqual(fiftyCount, 2, 'each run carries previousDelayMs=50 into its 2nd backoff call');
  });

  it('passes the attempt index to the operation', async () => {
    const sleeper = new RecordingSleeper();
    const runner = new GORetryRunner({
      maxAttempts: 4,
      sleeper,
      backoff: GOBackoff.constant(1),
      classifier: constantClassifier('retriable'),
    });

    const seenAttempts: number[] = [];
    await assert.rejects(
      runner.run(async (attempt) => {
        seenAttempts.push(attempt);
        await Promise.resolve();
        throw new Error('e');
      }),
      /e/,
    );

    assert.deepStrictEqual(seenAttempts, [0, 1, 2, 3]);
  });

  it('maxAttempts=0 throws GOPollingError(kind: exhausted) without attempting (defensive guard)', async () => {
    const runner = new GORetryRunner({ maxAttempts: 0, classifier: constantClassifier('retriable') });
    let calls = 0;
    await assert.rejects(
      runner.run(async () => {
        calls++;
        await Promise.resolve();
        return 'never';
      }),
      (e: unknown): boolean => e instanceof GOPollingError && e.kind === 'exhausted',
    );
    assert.strictEqual(calls, 0);
  });

  it('check abort/budget BEFORE each attempt, not just at start', async () => {
    // Sleeper that triggers abort mid-run via a side channel.
    const controller = new AbortController();
    const sleeper: GOSleeper = {
      async sleep(_ms: number, signal?: AbortSignal): Promise<void> {
        if (signal?.aborted === true) {
          throw new GOPollingError('aborted', 'Aborted before sleep');
        }
        // Resolve normally; the controller is aborted by the test scheduler below.
        await Promise.resolve();
      },
    };
    const runner = new GORetryRunner({
      maxAttempts: 5,
      sleeper,
      backoff: GOBackoff.constant(1),
      classifier: constantClassifier('retriable'),
      signal: controller.signal,
    });

    let calls = 0;
    await assert.rejects(
      runner.run(async () => {
        calls++;
        if (calls === 2) controller.abort();
        await Promise.resolve();
        throw new Error('e');
      }),
      (e: unknown): boolean => e instanceof GOPollingError && e.kind === 'aborted',
    );
    // 1st attempt runs; 2nd attempt runs and aborts; sleep raises abort.
    assert.ok(calls >= 1 && calls <= 3, `expected 1-3 attempts before abort, got ${String(calls)}`);
  });
});
