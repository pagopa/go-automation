import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  asRecord,
  optionalString,
  rejectUnknownKeys,
  requiredString,
  stringList,
  stringRecord,
} from '../configGuards.js';

describe('configGuards', () => {
  it('asRecord accepts plain objects only', () => {
    assert.deepEqual(asRecord({ a: 1 }, 'x'), { a: 1 });
    for (const value of [null, undefined, [], 'a', 1, new Date()]) {
      assert.throws(() => asRecord(value, 'x.y'), /^Error: x\.y: must be an object$/);
    }
  });

  it('rejectUnknownKeys names the first unknown key', () => {
    assert.doesNotThrow(() => rejectUnknownKeys({ a: 1 }, new Set(['a', 'b']), 'x'));
    assert.throws(() => rejectUnknownKeys({ a: 1, c: 2 }, new Set(['a']), 'x'), /x: unknown key "c"/);
  });

  it('requiredString and optionalString trim and reject blank strings', () => {
    assert.equal(requiredString('  v ', 'x'), 'v');
    for (const value of ['', '   ', 1, undefined, null]) {
      assert.throws(() => requiredString(value, 'x'), /x: must be a non-empty string/);
    }
    assert.equal(optionalString(undefined, 'x'), undefined);
    assert.equal(optionalString(' v', 'x'), 'v');
    assert.throws(() => optionalString(' ', 'x'), /x: must be a non-empty string/);
  });

  it('stringList requires an array of non-blank strings', () => {
    assert.deepEqual(stringList([' a', 'b '], 'x'), ['a', 'b']);
    assert.deepEqual(stringList([], 'x'), []);
    assert.throws(() => stringList('a', 'x'), /x: must be an array of strings/);
    assert.throws(() => stringList(['a', 1], 'x'), /x\[1\]: must be a non-empty string/);
    assert.throws(() => stringList(['a', ' '], 'x'), /x\[1\]: must be a non-empty string/);
  });

  it('stringRecord requires string values and trims them, keeping own keys only', () => {
    assert.deepEqual(stringRecord({ a: ' 1 ', b: '' }, 'x'), { a: '1', b: '' });
    assert.throws(() => stringRecord({ a: 1 }, 'x'), /x\.a: must be a string/);
    const record = stringRecord(JSON.parse('{"__proto__": "p"}'), 'x');
    assert.ok(Object.hasOwn(record, '__proto__'));
    assert.equal(Object.getPrototypeOf(record), Object.prototype);
  });
});
