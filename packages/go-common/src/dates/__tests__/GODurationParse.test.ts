import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseDuration, SET_TIMEOUT_MAX_MS } from '../GODurationParse.js';

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
    assert.throws(() => parseDuration('-5s', 'x'), /invalid duration/);
    assert.throws(() => parseDuration('10 s', 'x'), /invalid duration/);
    assert.throws(() => parseDuration('', 'x'), /invalid duration/);
  });

  it('ignores surrounding whitespace', () => {
    assert.equal(parseDuration('  10s\t', 'x'), 10_000);
  });

  it('rejects upper-case units', () => {
    assert.throws(() => parseDuration('10S', 'x'), /invalid duration "10S"/);
    assert.throws(() => parseDuration('5M', 'x'), /invalid duration/);
    assert.throws(() => parseDuration('200MS', 'x'), /invalid duration/);
  });

  it('rejects combined units', () => {
    assert.throws(() => parseDuration('1h30m', 'x'), /invalid duration "1h30m"/);
  });

  it('rounds to whole milliseconds', () => {
    assert.equal(parseDuration('0.0015s', 'x'), 2);
    assert.equal(parseDuration('.5s', 'x'), 500);
  });

  it('accepts zero by default and rejects it with minMs: 1', () => {
    assert.equal(parseDuration('0s', 'x'), 0);
    assert.equal(parseDuration('0ms', 'x'), 0);
    assert.equal(parseDuration('0.0001s', 'x'), 0);
    assert.throws(
      () => parseDuration('0s', 'send.timeout', { minMs: 1 }),
      /send\.timeout: duration "0s" is 0 ms, below the minimum of 1 ms/,
    );
    assert.throws(() => parseDuration('0.0001s', 'x', { minMs: 1 }), /below the minimum/);
    assert.equal(parseDuration('1ms', 'x', { minMs: 1 }), 1);
  });

  it('rejects durations above the setTimeout maximum by default', () => {
    assert.equal(parseDuration(`${SET_TIMEOUT_MAX_MS}ms`, 'x'), SET_TIMEOUT_MAX_MS);
    assert.equal(parseDuration('24d', 'x'), 24 * 86_400_000);
    assert.throws(
      () => parseDuration('25d', 'verify.timeout'),
      /verify\.timeout: duration "25d" is 2160000000 ms, above the maximum of 2147483647 ms/,
    );
    assert.throws(() => parseDuration(`${SET_TIMEOUT_MAX_MS + 1}ms`, 'x'), /above the maximum/);
  });

  it('honours a custom range', () => {
    assert.equal(parseDuration('25d', 'x', { maxMs: Number.MAX_SAFE_INTEGER }), 25 * 86_400_000);
    assert.throws(() => parseDuration('2h', 'x', { maxMs: 3_600_000 }), /above the maximum of 3600000 ms/);
    assert.throws(() => parseDuration('500ms', 'x', { minMs: 1_000 }), /below the minimum of 1000 ms/);
  });
});
