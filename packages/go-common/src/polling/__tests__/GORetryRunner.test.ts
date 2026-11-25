import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOBackoff } from '../GOBackoff.js';
import { GORetryRunner } from '../GORetryRunner.js';
import type { GORetryAttemptInfo } from '../GORetryAttemptInfo.js';
import type { GORetryClassifier } from '../GORetryClassifier.js';
import type { GOSleeper } from '../GOSleeper.js';
import { RecordingSleeper } from './helpers/RecordingSleeper.js';
import { pollingErrorOfKind } from './helpers/pollingErrorOfKind.js';

/** Classifier helper: always returns the given decision. */
function constantClassifier(decision: 'retriable' | 'fatal' | 'unknown'): GORetryClassifier {
  return { classify: () => decision };
}

describe('GORetryRunner', () => {
  it('retries on retriable errors until success, sleeping only between attempts', async () => {
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

  const fatalCases: ReadonlyArray<{ readonly name: string; readonly classifier?: GORetryClassifier }> = [
    { name: "a 'fatal' classification", classifier: constantClassifier('fatal') },
    {
      name: "an 'unknown' classification (unknownDecision defaults to fatal)",
      classifier: constantClassifier('unknown'),
    },
    { name: 'no classifier (every error is unknown)' },
  ];
  for (const { name, classifier } of fatalCases) {
    it(`propagates the error immediately on ${name}`, async () => {
      const sleeper = new RecordingSleeper();
      const runner = new GORetryRunner({
        maxAttempts: 5,
        sleeper,
        ...(classifier !== undefined ? { classifier } : {}),
      });
      const boom = new Error('boom');

      let calls = 0;
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
  }

  it("retries 'unknown' classifications when unknownDecision='retriable'", async () => {
    const sleeper = new RecordingSleeper();
    const runner = new GORetryRunner({
      maxAttempts: 3,
      sleeper,
      backoff: GOBackoff.constant(5),
      classifier: constantClassifier('unknown'),
      unknownDecision: 'retriable',
    });

    await assert.rejects(
      runner.run(async () => Promise.reject(new Error('keep trying'))),
      /keep trying/,
    );
    assert.deepStrictEqual(sleeper.calls, [5, 5], 'all attempts consumed');
  });

  it('throws the last error after exhausting maxAttempts, passing the attempt index to the operation', async () => {
    const sleeper = new RecordingSleeper();
    const runner = new GORetryRunner({
      maxAttempts: 3,
      sleeper,
      backoff: GOBackoff.constant(1),
      classifier: constantClassifier('retriable'),
    });

    const seenAttempts: number[] = [];
    await assert.rejects(
      runner.run(async (attempt) => {
        seenAttempts.push(attempt);
        await Promise.resolve();
        throw new Error(`attempt-${String(attempt)}`);
      }),
      /attempt-2/,
    );
    assert.deepStrictEqual(seenAttempts, [0, 1, 2]);
    assert.deepStrictEqual(sleeper.calls, [1, 1]);
  });

  it('maxAttempts=0 throws GOPollingError(kind: exhausted) without attempting (defensive guard)', async () => {
    const runner = new GORetryRunner({ maxAttempts: 0, classifier: constantClassifier('retriable') });
    let calls = 0;
    await assert.rejects(
      runner.run(async () => {
        calls++;
        return Promise.resolve('never');
      }),
      pollingErrorOfKind('exhausted'),
    );
    assert.strictEqual(calls, 0);
  });

  it('throws GOPollingError(kind: aborted) when signal is already aborted before the first attempt', async () => {
    const controller = new AbortController();
    controller.abort();
    const runner = new GORetryRunner({ signal: controller.signal });

    await assert.rejects(
      runner.run(async () => Promise.resolve('never')),
      pollingErrorOfKind('aborted'),
    );
  });

  it('checks the abort signal before each attempt, not just at start', async () => {
    // A sleeper that ignores the signal: only the pre-attempt check can stop the run.
    const controller = new AbortController();
    const sleeper: GOSleeper = { sleep: async () => Promise.resolve() };
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
        controller.abort();
        return Promise.reject(new Error('e'));
      }),
      pollingErrorOfKind('aborted'),
    );
    assert.strictEqual(calls, 1);
  });

  it('aborts during sleep (no need to wait the full delay)', async () => {
    // Real GODefaultSleeper to exercise the abort-during-sleep path.
    const controller = new AbortController();
    const runner = new GORetryRunner({
      maxAttempts: 5,
      backoff: GOBackoff.constant(5000),
      classifier: constantClassifier('retriable'),
      signal: controller.signal,
    });

    const start = Date.now();
    const promise = runner.run(async () => Promise.reject(new Error('transient')));
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
    const runner = new GORetryRunner({
      maxAttempts: 10,
      sleeper,
      backoff: GOBackoff.constant(30),
      classifier: constantClassifier('retriable'),
      maxElapsedMs: 50,
    });

    let calls = 0;
    await assert.rejects(
      runner.run(async () => {
        calls++;
        return Promise.reject(new Error('transient'));
      }),
      pollingErrorOfKind('budget-exceeded'),
    );
    // Attempts at t=0 and t=30 run; the check at t=60 exceeds the 50ms budget.
    assert.strictEqual(calls, 2);
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
    assert.strictEqual(typeof events[0]?.elapsedMs, 'number');
    assert.ok(events[0]?.lastError instanceof Error);
    assert.strictEqual(events[1]?.attempt, 1);
  });

  it("respects classifier's GORetryAdvice.delayMs override and reports delayOverridden=true", async () => {
    const sleeper = new RecordingSleeper();
    const events: GORetryAttemptInfo[] = [];
    const runner = new GORetryRunner({
      maxAttempts: 3,
      sleeper,
      backoff: GOBackoff.constant(100), // would be 100 if not overridden
      classifier: { classify: () => ({ decision: 'retriable', delayMs: 9999 }) },
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
    const sleeper = new RecordingSleeper();
    const seenPreviousDelays: (number | undefined)[] = [];
    const backoff = ({ previousDelayMs }: { attempt: number; previousDelayMs?: number }): number => {
      seenPreviousDelays.push(previousDelayMs);
      return 42;
    };

    // Attempt 0 → override 999, attempt 1 → backoff, attempt 2 → override 888.
    let callCount = 0;
    const classifier: GORetryClassifier = {
      classify: () => {
        callCount++;
        if (callCount === 1) return { decision: 'retriable', delayMs: 999 };
        if (callCount === 2) return 'retriable';
        return { decision: 'retriable', delayMs: 888 };
      },
    };

    const runner = new GORetryRunner({ maxAttempts: 4, sleeper, backoff, classifier });

    await assert.rejects(
      runner.run(async () => Promise.reject(new Error('e'))),
      /e/,
    );

    assert.deepStrictEqual(sleeper.calls, [999, 42, 888]);
    // The only backoff call (attempt 1) must not see the overridden 999.
    assert.deepStrictEqual(seenPreviousDelays, [undefined]);
  });

  it('per-run isolation: two concurrent run() calls on the SAME instance share no previousDelayMs', async () => {
    // If previousDelayMs were stored on `this` (or in the backoff closure),
    // interleaved run() calls would see each other's "last" delay.
    const observedPrev: (number | undefined)[] = [];
    const backoff = ({ previousDelayMs }: { attempt: number; previousDelayMs?: number }): number => {
      observedPrev.push(previousDelayMs);
      return 50;
    };

    // Sleeper that yields to the event loop so the two runs interleave.
    const interleavingSleeper: GOSleeper = {
      async sleep(): Promise<void> {
        await new Promise<void>((resolve) => setImmediate(resolve));
      },
    };

    const runner = new GORetryRunner({
      maxAttempts: 3,
      backoff,
      classifier: constantClassifier('retriable'),
      sleeper: interleavingSleeper,
    });

    await Promise.allSettled([
      runner.run(async () => Promise.reject(new Error('A'))),
      runner.run(async () => Promise.reject(new Error('B'))),
    ]);

    // Each run: 3 attempts → 2 backoff calls seeing [undefined, 50].
    assert.deepStrictEqual(
      [...observedPrev].sort(), // sort() places undefined last
      [50, 50, undefined, undefined],
    );
  });
});
