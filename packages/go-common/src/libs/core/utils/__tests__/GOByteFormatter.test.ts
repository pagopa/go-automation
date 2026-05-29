import { describe, it } from 'node:test';
import assert from 'node:assert';

import { formatBytes } from '../GOByteFormatter.js';

describe('GOByteFormatter', () => {
  it('formats zero and invalid values as zero bytes', () => {
    assert.strictEqual(formatBytes(0), '0 B');
    assert.strictEqual(formatBytes(-1), '0 B');
    assert.strictEqual(formatBytes(Number.NaN), '0 B');
    assert.strictEqual(formatBytes(Number.POSITIVE_INFINITY), '0 B');
  });

  it('formats byte values without fractional digits by default', () => {
    assert.strictEqual(formatBytes(512), '512 B');
    assert.strictEqual(formatBytes(1023), '1023 B');
  });

  it('uses compact automatic precision for scaled values', () => {
    assert.strictEqual(formatBytes(1024), '1.0 KB');
    assert.strictEqual(formatBytes(1536), '1.5 KB');
    assert.strictEqual(formatBytes(10 * 1024), '10 KB');
    assert.strictEqual(formatBytes(1024 * 1024), '1.0 MB');
  });

  it('supports a fixed number of fractional digits', () => {
    assert.strictEqual(formatBytes(512, { fractionDigits: 2 }), '512.00 B');
    assert.strictEqual(formatBytes(1536, { fractionDigits: 2 }), '1.50 KB');
  });

  it('supports fixed fractional digits for scaled values only', () => {
    assert.strictEqual(formatBytes(512, { scaledFractionDigits: 1 }), '512 B');
    assert.strictEqual(formatBytes(10 * 1024, { scaledFractionDigits: 1 }), '10.0 KB');
  });

  it('supports a custom automatic precision threshold', () => {
    assert.strictEqual(formatBytes(10 * 1024, { autoFractionDigitsBelow: 100 }), '10.0 KB');
    assert.strictEqual(formatBytes(100 * 1024, { autoFractionDigitsBelow: 100 }), '100 KB');
  });
});
