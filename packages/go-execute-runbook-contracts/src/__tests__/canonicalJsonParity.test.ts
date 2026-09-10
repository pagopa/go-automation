import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import { canonicalizeJson as goCommonCanonicalizeJson } from '@go-automation/go-common/core';

import { canonicalizeJson as contractsCanonicalizeJson } from '../canonicalJson.js';

/**
 * This package carries its own canonicalization so it stays a leaf with no
 * runtime dependency, while `go-runbook` reaches the identical function through
 * `go-common`. The two copies are not interchangeable by accident:
 * `definitionDigest` is hashed over one and the catalog revision over the
 * other, so a difference between them would either republish every runbook as
 * changed or hide a real change behind an unchanged digest. Nothing but this
 * test keeps them honest, which is why the corpus covers each branch of the
 * algorithm rather than a couple of happy paths.
 */
const CORPUS: ReadonlyArray<readonly [string, unknown]> = [
  ['primitives', [1, -0, 'x', true, false, null]],
  ['empty containers', { a: {}, b: [] }],
  ['key order', { zeta: 1, Alpha: 2, alpha: 3, _under: 4, '0': 5, '': 6 }],
  ['array order is data, not a set', { list: ['b', 'a', 'c'] }],
  ['nesting', { a: { c: [{ z: 1, y: 2 }], b: { d: null } } }],
  // Why both copies sort by code point instead of using the default
  // comparator: UTF-16 order puts an astral key before U+FB00, code point
  // order after it.
  ['astral vs BMP keys', { '\u{1D400}': 1, ﬀ: 2, z: 3 }],
  ['keys sharing a prefix', { ab: 1, a: 2, abc: 3 }],
  ['strings JSON must escape', { 'a b': '"\\\n' }],
  ['numbers JSON reformats', [1e21, 1e-7, 0.1 + 0.2, Number.MAX_SAFE_INTEGER]],
  // Shape of a real descriptor: the value whose digest actually ships.
  [
    'runbook descriptor',
    {
      version: 1,
      key: 'pn-external-registries-IO-downstream-detection-Alarm',
      kind: 'DOWNSTREAM',
      alarmNames: ['pn-external-registries-IO-downstream-detection-Alarm'],
      categories: ['INTEGRATION'],
      definitionDigest: 'sha256-0000',
    },
  ],
];

describe('canonicalJson parity with go-common', () => {
  for (const [name, value] of CORPUS) {
    it(`serializes ${name} identically`, () => {
      const fromContracts = contractsCanonicalizeJson(value);
      assert.strictEqual(fromContracts, goCommonCanonicalizeJson(value));
      // A serialization that no longer round-trips would agree with itself
      // while having stopped being JSON.
      assert.deepStrictEqual(JSON.parse(fromContracts), JSON.parse(JSON.stringify(value)));
    });
  }

  it('produces the same sha256 digest, which is what the two are used for', () => {
    const digest = (canonical: string): string => createHash('sha256').update(canonical, 'utf8').digest('hex');
    for (const [, value] of CORPUS) {
      assert.strictEqual(digest(contractsCanonicalizeJson(value)), digest(goCommonCanonicalizeJson(value)));
    }
  });

  it('rejects non-finite numbers on both sides rather than writing null', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, { nested: [Number.NEGATIVE_INFINITY] }]) {
      assert.throws(() => contractsCanonicalizeJson(value), /non-finite/u);
      assert.throws(() => goCommonCanonicalizeJson(value), /non-finite/u);
    }
  });
});
