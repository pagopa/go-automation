import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseDuration } from '../GODurationParse.js';

describe('parseDuration', () => {
  it('parses every unit', () => {
    assert.equal(parseDuration('200ms', 'x'), 200);
    assert.equal(parseDuration('10s', 'x'), 10_000);
    assert.equal(parseDuration('15m', 'x'), 900_000);
    assert.equal(parseDuration('2h', 'x'), 7_200_000);
    assert.equal(parseDuration('1.5h', 'x'), 5_400_000);
    assert.equal(parseDuration('6d', 'x'), 518_400_000);
  });

  it('rejects malformed values naming the parameter', () => {
    assert.throws(() => parseDuration('10', 'verify.timeout'), /verify\.timeout: invalid duration "10"/);
    assert.throws(() => parseDuration('ten minutes', 'x'), /invalid duration/);
  });
});
