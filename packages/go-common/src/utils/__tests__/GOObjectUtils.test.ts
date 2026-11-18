import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { omitUndefined } from '../GOObjectUtils.js';

describe('omitUndefined', () => {
  it('drops only undefined properties, keeping falsy values, without mutating the input', () => {
    const input = { a: 1, b: undefined, zero: 0, empty: '', no: false, nothing: null };

    assert.deepStrictEqual(omitUndefined(input), { a: 1, zero: 0, empty: '', no: false, nothing: null });
    assert.deepStrictEqual(omitUndefined({ a: undefined, b: undefined }), {});
    assert.ok('b' in input, 'input not mutated');
  });
});
