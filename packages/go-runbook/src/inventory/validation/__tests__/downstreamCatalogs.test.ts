import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { INTEROP_DOWNSTREAMS } from '../../../toolkits/interop/analysis/INTEROP_DOWNSTREAMS.js';
import { SEND_DOWNSTREAMS } from '../../../toolkits/send/analysis/SEND_DOWNSTREAMS.js';

const CATALOGS = [
  { product: 'SEND', catalog: SEND_DOWNSTREAMS as Readonly<Record<string, string>> },
  { product: 'INTEROP', catalog: INTEROP_DOWNSTREAMS as Readonly<Record<string, string>> },
];

describe('downstream catalogs', () => {
  for (const { product, catalog } of CATALOGS) {
    it(`${product}: declares unique, trimmed values under CONSTANT_CASE keys`, () => {
      const values = Object.values(catalog);
      assert.strictEqual(new Set(values).size, values.length, 'a census value is declared twice');
      for (const [key, value] of Object.entries(catalog)) {
        assert.match(key, /^[A-Z][A-Z0-9_]*$/u, `key "${key}" is not CONSTANT_CASE`);
        assert.notStrictEqual(value.trim(), '', `${key} is empty`);
        assert.strictEqual(value, value.trim(), `value "${value}" carries surrounding whitespace`);
      }
    });
  }
});
