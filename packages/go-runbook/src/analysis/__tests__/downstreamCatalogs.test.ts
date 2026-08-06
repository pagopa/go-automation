import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { INTEROP_DOWNSTREAMS } from '../downstreams/INTEROP_DOWNSTREAMS.js';
import { SEND_DOWNSTREAMS } from '../downstreams/SEND_DOWNSTREAMS.js';

const CATALOGS = [
  { product: 'SEND', catalog: SEND_DOWNSTREAMS as Readonly<Record<string, string>> },
  { product: 'INTEROP', catalog: INTEROP_DOWNSTREAMS as Readonly<Record<string, string>> },
];

describe('downstream catalogs', () => {
  for (const { product, catalog } of CATALOGS) {
    it(`${product}: declares unique values`, () => {
      const values = Object.values(catalog);
      assert.strictEqual(new Set(values).size, values.length, 'a census value is declared twice');
    });

    it(`${product}: uses CONSTANT_CASE keys`, () => {
      for (const key of Object.keys(catalog)) {
        assert.match(key, /^[A-Z][A-Z0-9_]*$/, `key "${key}" is not CONSTANT_CASE`);
      }
    });

    it(`${product}: declares no blank or untrimmed value`, () => {
      for (const value of Object.values(catalog)) {
        assert.notStrictEqual(value.trim(), '', 'a census value is empty');
        assert.strictEqual(value, value.trim(), `value "${value}" carries surrounding whitespace`);
      }
    });
  }

  it('keeps the products separate where the censuses disagree', () => {
    // The apply matches byte for byte: "SelfCare" (SEND) and "Selfcare" (INTEROP)
    // are different rows, which is precisely why the catalogs are per product.
    assert.strictEqual(SEND_DOWNSTREAMS.SELFCARE, 'SelfCare');
    assert.strictEqual(INTEROP_DOWNSTREAMS.SELFCARE, 'Selfcare');
    assert.notStrictEqual(SEND_DOWNSTREAMS.SELFCARE, INTEROP_DOWNSTREAMS.SELFCARE);
  });
});
