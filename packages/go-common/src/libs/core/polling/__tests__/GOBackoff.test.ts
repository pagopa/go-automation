import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { GOBackoff } from '../GOBackoff.js';

describe('GOBackoff', () => {
  describe('constant', () => {
    it('returns the same value regardless of attempt or previousDelayMs', () => {
      const backoff = GOBackoff.constant(250);
      assert.strictEqual(backoff({ attempt: 0 }), 250);
      assert.strictEqual(backoff({ attempt: 5 }), 250);
      assert.strictEqual(backoff({ attempt: 10, previousDelayMs: 9999 }), 250);
    });

    it('supports zero', () => {
      const backoff = GOBackoff.constant(0);
      assert.strictEqual(backoff({ attempt: 0 }), 0);
    });
  });

  describe('linear', () => {
    it('returns baseMs * (attempt + 1)', () => {
      const backoff = GOBackoff.linear(100);
      assert.strictEqual(backoff({ attempt: 0 }), 100);
      assert.strictEqual(backoff({ attempt: 1 }), 200);
      assert.strictEqual(backoff({ attempt: 4 }), 500);
    });

    it('respects cap when provided', () => {
      const backoff = GOBackoff.linear(100, 300);
      assert.strictEqual(backoff({ attempt: 0 }), 100);
      assert.strictEqual(backoff({ attempt: 2 }), 300);
      assert.strictEqual(backoff({ attempt: 10 }), 300);
    });

    it('no cap when capMs is undefined', () => {
      const backoff = GOBackoff.linear(50);
      assert.strictEqual(backoff({ attempt: 99 }), 5000);
    });
  });

  describe('exponential', () => {
    it('returns baseMs * 2^attempt up to cap', () => {
      const backoff = GOBackoff.exponential(100, 1600);
      assert.strictEqual(backoff({ attempt: 0 }), 100);
      assert.strictEqual(backoff({ attempt: 1 }), 200);
      assert.strictEqual(backoff({ attempt: 2 }), 400);
      assert.strictEqual(backoff({ attempt: 3 }), 800);
      assert.strictEqual(backoff({ attempt: 4 }), 1600);
      assert.strictEqual(backoff({ attempt: 10 }), 1600, 'cap respected at high attempts');
    });

    it('uses defaults (500ms base, 3000ms cap) when no args', () => {
      const backoff = GOBackoff.exponential();
      assert.strictEqual(backoff({ attempt: 0 }), 500);
      assert.strictEqual(backoff({ attempt: 1 }), 1000);
      assert.strictEqual(backoff({ attempt: 2 }), 2000);
      assert.strictEqual(backoff({ attempt: 3 }), 3000);
      assert.strictEqual(backoff({ attempt: 10 }), 3000);
    });
  });

  describe('exponentialJittered', () => {
    // Math.random stubbing to make tests deterministic.
    const originalRandom = Math.random;
    afterEach(() => {
      Math.random = originalRandom;
    });

    it('returns value in [0, exponential(attempt)] (Math.random=0)', () => {
      Math.random = (): number => 0;
      const backoff = GOBackoff.exponentialJittered(100, 800);
      assert.strictEqual(backoff({ attempt: 0 }), 0);
      assert.strictEqual(backoff({ attempt: 3 }), 0);
    });

    it('returns value in [0, exponential(attempt)] (Math.random≈1)', () => {
      Math.random = (): number => 0.9999;
      const backoff = GOBackoff.exponentialJittered(100, 800);
      // floor(0.9999 * 100) = 99
      assert.strictEqual(backoff({ attempt: 0 }), 99);
      // floor(0.9999 * min(100*8, 800)) = floor(0.9999 * 800) = 799
      assert.strictEqual(backoff({ attempt: 3 }), 799);
    });

    it('respects the cap when exponential exceeds it', () => {
      Math.random = (): number => 1 - Number.EPSILON;
      const backoff = GOBackoff.exponentialJittered(100, 500);
      const value = backoff({ attempt: 10 }); // 100 * 1024 = 102400, capped at 500
      assert.ok(value <= 500, `expected <= 500, got ${value}`);
    });
  });

  describe('decorrelatedJittered', () => {
    const originalRandom = Math.random;
    afterEach(() => {
      Math.random = originalRandom;
    });

    it('uses baseMs as seed on the first attempt (no previousDelayMs)', () => {
      // With previousDelayMs=undefined → last=baseMs → window=[base, min(cap, base*3)]
      // Math.random=0 → result = baseMs + 0 = baseMs
      Math.random = (): number => 0;
      const backoff = GOBackoff.decorrelatedJittered(100, 3000);
      assert.strictEqual(backoff({ attempt: 0 }), 100);
    });

    it('produces a value in [baseMs, min(cap, previousDelayMs * 3)] window', () => {
      // base=100, cap=3000, previousDelayMs=500 → upper=min(3000, 1500)=1500, span=1400
      // Math.random=0 → 100; Math.random≈1 → 100 + floor(0.9999*1400) = 100 + 1399 = 1499
      Math.random = (): number => 0;
      const backoffMin = GOBackoff.decorrelatedJittered(100, 3000);
      assert.strictEqual(backoffMin({ attempt: 1, previousDelayMs: 500 }), 100);

      Math.random = (): number => 0.9999;
      const backoffMax = GOBackoff.decorrelatedJittered(100, 3000);
      assert.strictEqual(backoffMax({ attempt: 1, previousDelayMs: 500 }), 1499);
    });

    it('caps the result at capMs', () => {
      // base=100, cap=200, previousDelayMs=10000 → upper=min(200, 30000)=200, span=100
      // any Math.random → 100 + floor(r*100) ∈ [100, 200), capped at 200
      Math.random = (): number => 0.9999;
      const backoff = GOBackoff.decorrelatedJittered(100, 200);
      const value = backoff({ attempt: 5, previousDelayMs: 10000 });
      assert.ok(value <= 200, `expected <= 200, got ${value}`);
    });

    it('factory purity: two parallel runs with shared instance and same context produce independent values', () => {
      // The instance must not retain mutable state. If it did, two concurrent
      // runs sharing the same backoff would interleave their "last" and drift.
      const backoff = GOBackoff.decorrelatedJittered(100, 3000);
      // Two distinct runs, both with the same previousDelayMs, must use the
      // value passed in the context — NOT a value carried over from a prior call.
      Math.random = (): number => 0;
      const runA0 = backoff({ attempt: 0 }); // 100 (uses baseMs)
      const runB0 = backoff({ attempt: 0 }); // 100 (uses baseMs again)
      assert.strictEqual(runA0, 100);
      assert.strictEqual(runB0, 100);

      // After runA computes 100, runA's *next* call passes previousDelayMs=100.
      // runB is meanwhile still at attempt=0. They must not interfere.
      const runA1 = backoff({ attempt: 1, previousDelayMs: 100 }); // upper=min(3000,300)=300, span=200, → 100
      const runB1 = backoff({ attempt: 0 }); // same as runB0
      assert.strictEqual(runA1, 100);
      assert.strictEqual(runB1, 100);
    });

    it('handles edge case where capMs < baseMs by clamping to capMs (no negative jitter)', () => {
      // Defensive: if cap<base, span clamps to 0 → baseMs + 0, then min(capMs, ...) returns capMs.
      Math.random = (): number => 0.5;
      const backoff = GOBackoff.decorrelatedJittered(500, 100);
      const value = backoff({ attempt: 0 });
      assert.strictEqual(value, 100, 'cap wins; never negative');
    });
  });
});
