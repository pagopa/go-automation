import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { deriveVarPrefix } from '../naming/deriveVarPrefix.js';

describe('deriveVarPrefix', () => {
  it('drops the pn- prefix and camelCases the remaining segments', () => {
    for (const [service, expected] of [
      ['pn-delivery', 'delivery'],
      ['pn-user-attributes', 'userAttributes'],
      ['pn-data-vault', 'dataVault'],
      ['', ''],
    ] as const) {
      assert.strictEqual(deriveVarPrefix(service), expected, service);
    }
  });
});
