import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { omitUndefined } from '../GOObjectUtils.js';

describe('omitUndefined', () => {
  it('drops undefined properties and keeps every other value', () => {
    assert.deepStrictEqual(omitUndefined({ a: 1, b: undefined, c: 'x' }), { a: 1, c: 'x' });
  });

  it('keeps falsy values that are not undefined', () => {
    assert.deepStrictEqual(omitUndefined({ zero: 0, empty: '', no: false, nothing: null }), {
      zero: 0,
      empty: '',
      no: false,
      nothing: null,
    });
  });

  it('returns an empty object when every property is undefined', () => {
    assert.deepStrictEqual(omitUndefined({ a: undefined, b: undefined }), {});
  });

  it('does not mutate the input', () => {
    const input = { a: 1, b: undefined };
    omitUndefined(input);
    assert.deepStrictEqual(Object.keys(input), ['a', 'b']);
  });
});
