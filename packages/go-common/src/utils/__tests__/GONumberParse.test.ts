import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseFiniteNumber, parseInteger } from '../GONumberParse.js';

describe('parseInteger', () => {
  it('parses whole numbers, trimming first', () => {
    assert.strictEqual(parseInteger(' 12 '), 12);
    assert.strictEqual(parseInteger('0'), 0);
    assert.strictEqual(parseInteger('-3'), -3);
  });

  it('rejects values that are not entirely an integer', () => {
    assert.strictEqual(parseInteger('12abc'), undefined);
    assert.strictEqual(parseInteger('1.5'), undefined);
    assert.strictEqual(parseInteger('abc'), undefined);
  });

  it('rejects absent and blank values', () => {
    assert.strictEqual(parseInteger(undefined), undefined);
    assert.strictEqual(parseInteger(''), undefined);
    assert.strictEqual(parseInteger('   '), undefined);
  });
});

describe('parseFiniteNumber', () => {
  it('accepts integral and fractional values', () => {
    assert.strictEqual(parseFiniteNumber('1.5'), 1.5);
    assert.strictEqual(parseFiniteNumber('12'), 12);
    assert.strictEqual(parseFiniteNumber('-0.25'), -0.25);
  });

  it('rejects non-finite and malformed values', () => {
    assert.strictEqual(parseFiniteNumber('Infinity'), undefined);
    assert.strictEqual(parseFiniteNumber('NaN'), undefined);
    assert.strictEqual(parseFiniteNumber('12abc'), undefined);
    assert.strictEqual(parseFiniteNumber(undefined), undefined);
  });
});
