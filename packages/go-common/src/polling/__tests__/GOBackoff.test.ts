import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOBackoff } from '../GOBackoff.js';
import type { GOBackoffContext } from '../GOBackoffContext.js';
import type { GOBackoffFn } from '../GOBackoffFn.js';

/** One expected backoff output for a given context. */
interface BackoffCase {
  readonly context: GOBackoffContext;
  readonly expected: number;
}

/** Asserts every case against the same backoff instance (also guards against hidden state). */
function assertBackoff(backoff: GOBackoffFn, cases: ReadonlyArray<BackoffCase>): void {
  for (const { context, expected } of cases) {
    assert.strictEqual(backoff(context), expected, JSON.stringify(context));
  }
}

describe('GOBackoff', () => {
  it('constant returns the same value regardless of attempt or previousDelayMs', () => {
    assertBackoff(GOBackoff.constant(250), [
      { context: { attempt: 0 }, expected: 250 },
      { context: { attempt: 10, previousDelayMs: 9999 }, expected: 250 },
    ]);
  });

  it('linear returns baseMs * (attempt + 1), capped only when capMs is provided', () => {
    assertBackoff(GOBackoff.linear(100), [
      { context: { attempt: 0 }, expected: 100 },
      { context: { attempt: 1 }, expected: 200 },
      { context: { attempt: 99 }, expected: 10000 },
    ]);
    assertBackoff(GOBackoff.linear(100, 300), [
      { context: { attempt: 0 }, expected: 100 },
      { context: { attempt: 2 }, expected: 300 },
      { context: { attempt: 10 }, expected: 300 },
    ]);
  });

  it('exponential returns baseMs * 2^attempt up to cap (defaults 500ms → 3000ms)', () => {
    assertBackoff(GOBackoff.exponential(100, 1600), [
      { context: { attempt: 0 }, expected: 100 },
      { context: { attempt: 3 }, expected: 800 },
      { context: { attempt: 4 }, expected: 1600 },
      { context: { attempt: 10 }, expected: 1600 },
    ]);
    assertBackoff(GOBackoff.exponential(), [
      { context: { attempt: 0 }, expected: 500 },
      { context: { attempt: 2 }, expected: 2000 },
      { context: { attempt: 10 }, expected: 3000 },
    ]);
  });

  it('exponentialJittered returns floor(random * min(exponential, cap))', (t) => {
    const random = t.mock.method(Math, 'random', () => 0);
    const backoff = GOBackoff.exponentialJittered(100, 800);
    assertBackoff(backoff, [{ context: { attempt: 3 }, expected: 0 }]);

    random.mock.mockImplementation(() => 0.9999);
    assertBackoff(backoff, [
      { context: { attempt: 0 }, expected: 99 },
      { context: { attempt: 3 }, expected: 799 },
      { context: { attempt: 10 }, expected: 799 }, // 100 * 1024 capped at 800
    ]);
  });

  describe('decorrelatedJittered', () => {
    it('draws from [baseMs, min(cap, previousDelayMs * 3)), seeding with baseMs on the first attempt', (t) => {
      const random = t.mock.method(Math, 'random', () => 0);
      // One shared instance across calls: it must not retain state between them.
      const backoff = GOBackoff.decorrelatedJittered(100, 3000);
      assertBackoff(backoff, [
        { context: { attempt: 0 }, expected: 100 },
        { context: { attempt: 1, previousDelayMs: 500 }, expected: 100 },
      ]);

      random.mock.mockImplementation(() => 0.9999);
      assertBackoff(backoff, [
        // seed=100 → upper=300, span=200 → 100 + 199
        { context: { attempt: 0 }, expected: 299 },
        // upper=min(3000, 1500)=1500, span=1400 → 100 + 1399
        { context: { attempt: 1, previousDelayMs: 500 }, expected: 1499 },
        // upper=min(3000, 30000)=3000 → 100 + floor(0.9999 * 2900)
        { context: { attempt: 5, previousDelayMs: 10000 }, expected: 2999 },
      ]);
    });

    it('clamps to capMs when capMs < baseMs (no negative jitter)', (t) => {
      t.mock.method(Math, 'random', () => 0.5);
      assertBackoff(GOBackoff.decorrelatedJittered(500, 100), [{ context: { attempt: 0 }, expected: 100 }]);
    });
  });
});
