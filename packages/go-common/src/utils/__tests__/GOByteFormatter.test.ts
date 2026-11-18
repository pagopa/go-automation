import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatBytes } from '../GOByteFormatter.js';

describe('GOByteFormatter', () => {
  it('uses compact automatic precision by default, zero bytes for invalid values', () => {
    const cases: ReadonlyArray<readonly [bytes: number, expected: string]> = [
      [0, '0 B'],
      [-1, '0 B'],
      [Number.NaN, '0 B'],
      [Number.POSITIVE_INFINITY, '0 B'],
      [1023, '1023 B'],
      [1024, '1.0 KB'],
      [1536, '1.5 KB'],
      [10 * 1024, '10 KB'],
      [1024 * 1024, '1.0 MB'],
    ];
    for (const [bytes, expected] of cases) {
      assert.strictEqual(formatBytes(bytes), expected, String(bytes));
    }
  });

  it('honours fractionDigits, scaledFractionDigits and autoFractionDigitsBelow', () => {
    assert.strictEqual(formatBytes(0, { fractionDigits: 2 }), '0.00 B');
    assert.strictEqual(formatBytes(512, { fractionDigits: 2 }), '512.00 B');
    assert.strictEqual(formatBytes(1536, { fractionDigits: 2 }), '1.50 KB');
    assert.strictEqual(formatBytes(512, { scaledFractionDigits: 1 }), '512 B');
    assert.strictEqual(formatBytes(10 * 1024, { scaledFractionDigits: 1 }), '10.0 KB');
    assert.strictEqual(formatBytes(10 * 1024, { autoFractionDigitsBelow: 100 }), '10.0 KB');
    assert.strictEqual(formatBytes(100 * 1024, { autoFractionDigitsBelow: 100 }), '100 KB');
  });
});
