import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canonicalizeJson } from '../canonicalizeJson.js';

describe('canonicalizeJson', () => {
  it('orders keys by Unicode code point', () => {
    assert.strictEqual(canonicalizeJson({ b: 1, a: [2, 1] }), '{"a":[2,1],"b":1}');
    assert.strictEqual(canonicalizeJson({ zeta: 1, Alpha: 2, alpha: 3 }), '{"Alpha":2,"alpha":3,"zeta":1}');
    assert.strictEqual(canonicalizeJson({ abc: 1, a: 2, ab: 3 }), '{"a":2,"ab":3,"abc":1}');
  });

  it('sorts by code point rather than UTF-16 order', () => {
    // U+1D400 is an astral character: UTF-16 compares it by its leading
    // surrogate, which places it before U+FB00, while its code point places it
    // after. Only one of the two orders is reproducible off this platform.
    assert.strictEqual(canonicalizeJson({ '\u{1D400}': 1, ﬀ: 2, z: 3 }), '{"z":3,"ﬀ":2,"\u{1D400}":1}');
  });

  it('keeps integer-like keys in code-point order', () => {
    // The regression this file exists for. An object emits its integer-like
    // keys in ascending numeric order before every other key, whatever order
    // they were inserted in, so a canonicalizer that sorts a copy of the value
    // and then calls JSON.stringify loses the order it just established.
    assert.strictEqual(canonicalizeJson({ '10': 1, '2': 2 }), '{"10":1,"2":2}');
    assert.strictEqual(canonicalizeJson({ '2': 'b', '10': 'a', name: 'x' }), '{"10":"a","2":"b","name":"x"}');
    assert.strictEqual(canonicalizeJson({ outer: { '100': 1, '20': 2, '3': 3 } }), '{"outer":{"100":1,"20":2,"3":3}}');
    assert.strictEqual(canonicalizeJson([{ '10': 1, '2': 2 }]), '[{"10":1,"2":2}]');
    // `'01'` and `'-1'` are not array indices, so they sort among the string
    // keys rather than ahead of them: the two rules disagree here too.
    assert.strictEqual(canonicalizeJson({ '01': 'n', '1': 'c' }), '{"01":"n","1":"c"}');
    assert.strictEqual(canonicalizeJson({ '-1': 'neg', '1': 'pos' }), '{"-1":"neg","1":"pos"}');
  });

  it('is stable across insertion orders, which is what a digest depends on', () => {
    const left = canonicalizeJson({ '10': { z: 1, a: 2 }, '2': [3, 1], name: 'x' });
    const right = canonicalizeJson({ name: 'x', '2': [3, 1], '10': { a: 2, z: 1 } });
    assert.strictEqual(left, right);
  });

  it('preserves array order, which is data rather than a set', () => {
    assert.strictEqual(canonicalizeJson(['b', 'a', 'c']), '["b","a","c"]');
  });

  it('writes the same text as JSON.stringify for values JSON cannot represent', () => {
    assert.strictEqual(canonicalizeJson({ absent: undefined, kept: 1 }), '{"kept":1}');
    assert.strictEqual(canonicalizeJson([undefined, 1]), '[null,1]');
    assert.strictEqual(canonicalizeJson({ 'a b': '"\\\n' }), JSON.stringify({ 'a b': '"\\\n' }));
    assert.strictEqual(canonicalizeJson([1e21, 1e-7, 0.1 + 0.2]), JSON.stringify([1e21, 1e-7, 0.1 + 0.2]));
  });

  it('rejects non-finite numbers rather than writing them as null', () => {
    assert.throws(() => canonicalizeJson(Number.NaN), /non-finite/u);
    assert.throws(() => canonicalizeJson({ nested: [Number.POSITIVE_INFINITY] }), /non-finite/u);
    assert.throws(() => canonicalizeJson({ deep: { value: Number.NEGATIVE_INFINITY } }), /non-finite/u);
  });
});
