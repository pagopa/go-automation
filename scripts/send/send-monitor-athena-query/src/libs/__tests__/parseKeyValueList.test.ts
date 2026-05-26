import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseKeyValueList } from '../parseKeyValueList.js';

describe('parseKeyValueList', () => {
  it('parses key/value and JSON entries into a null-prototype dictionary', () => {
    const values = parseKeyValueList(['customerId=abc', '{"tableName":"analytics.events","limit":10}']);

    assert.strictEqual(Object.getPrototypeOf(values), null);
    assert.deepStrictEqual({ ...values }, { customerId: 'abc', tableName: 'analytics.events', limit: '10' });
  });

  it('rejects prototype-pollution keys from JSON entries', () => {
    assert.throws(() => parseKeyValueList(['{"__proto__":{"polluted":true}}']), /Unsafe key\/value entry key/);
    assert.throws(() => parseKeyValueList(['{"constructor":"x"}']), /Unsafe key\/value entry key/);
    assert.throws(() => parseKeyValueList(['{"prototype":"x"}']), /Unsafe key\/value entry key/);
  });

  it('rejects prototype-pollution keys from key/value entries', () => {
    assert.throws(() => parseKeyValueList(['__proto__=polluted']), /Unsafe key\/value entry key/);
    assert.throws(() => parseKeyValueList(['constructor=x']), /Unsafe key\/value entry key/);
    assert.throws(() => parseKeyValueList(['prototype=x']), /Unsafe key\/value entry key/);
  });
});
