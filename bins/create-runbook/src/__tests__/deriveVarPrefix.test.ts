import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { deriveVarPrefix } from '../naming/deriveVarPrefix.js';

describe('deriveVarPrefix', () => {
  it('returns the single segment for a simple service', () => {
    assert.strictEqual(deriveVarPrefix('pn-delivery'), 'delivery');
  });

  it('camelCases multi-segment service names', () => {
    assert.strictEqual(deriveVarPrefix('pn-user-attributes'), 'userAttributes');
    assert.strictEqual(deriveVarPrefix('pn-data-vault'), 'dataVault');
  });

  it('returns an empty string for an empty input', () => {
    assert.strictEqual(deriveVarPrefix(''), '');
  });
});
