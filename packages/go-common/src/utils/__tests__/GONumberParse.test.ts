import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseFiniteNumber, parseInteger } from '../GONumberParse.js';

describe('parseInteger', () => {
  it('parses trimmed whole numbers and rejects anything else', () => {
    const cases: ReadonlyArray<readonly [input: string | undefined, expected: number | undefined]> = [
      [' 12 ', 12],
      ['0', 0],
      ['-3', -3],
      ['12abc', undefined],
      ['1.5', undefined],
      ['abc', undefined],
      [undefined, undefined],
      ['', undefined],
      ['   ', undefined],
    ];
    for (const [input, expected] of cases) {
      assert.strictEqual(parseInteger(input), expected, String(input));
    }
  });
});

describe('parseFiniteNumber', () => {
  it('parses integral and fractional values and rejects non-finite or malformed ones', () => {
    const cases: ReadonlyArray<readonly [input: string | undefined, expected: number | undefined]> = [
      ['1.5', 1.5],
      ['12', 12],
      ['-0.25', -0.25],
      ['Infinity', undefined],
      ['NaN', undefined],
      ['12abc', undefined],
      [undefined, undefined],
    ];
    for (const [input, expected] of cases) {
      assert.strictEqual(parseFiniteNumber(input), expected, String(input));
    }
  });
});
