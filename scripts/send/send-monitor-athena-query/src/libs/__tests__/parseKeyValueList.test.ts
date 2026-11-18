import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseKeyValueList } from '../parseKeyValueList.js';

describe('parseKeyValueList', () => {
  it('parses key/value and JSON entries into a null-prototype dictionary', () => {
    const values = parseKeyValueList(['customerId=abc', '{"tableName":"analytics.events","limit":10}']);

    assert.strictEqual(Object.getPrototypeOf(values), null);
    assert.deepStrictEqual({ ...values }, { customerId: 'abc', tableName: 'analytics.events', limit: '10' });
  });

  it('rejects prototype-pollution keys from JSON and key/value entries', () => {
    for (const entry of [
      '{"__proto__":{"polluted":true}}',
      '{"constructor":"x"}',
      '{"prototype":"x"}',
      '__proto__=polluted',
      'constructor=x',
      'prototype=x',
    ]) {
      assert.throws(() => parseKeyValueList([entry]), /Unsafe key\/value entry key/, entry);
    }
  });

  it('wraps malformed JSON entries with key/value context', () => {
    assert.throws(() => parseKeyValueList(['{"tableName":"analytics.events"']), /Invalid JSON key\/value entry/);
  });
});
