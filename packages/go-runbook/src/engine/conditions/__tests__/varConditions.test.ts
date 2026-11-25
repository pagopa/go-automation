import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { varEquals, varExists, varMatches } from '../varConditions.js';

describe('var conditions', () => {
  it('builds predicates on the vars namespace, keeping literals as they are', () => {
    assert.deepStrictEqual(varMatches('errorMsg', 'ReadTimeoutException'), {
      type: 'pattern',
      ref: 'vars.errorMsg',
      regex: 'ReadTimeoutException',
    });
    assert.deepStrictEqual(varEquals('retryCount', 0), {
      type: 'compare',
      ref: 'vars.retryCount',
      operator: '==',
      value: 0,
    });
    assert.deepStrictEqual(varExists('traceId'), { type: 'exists', ref: 'vars.traceId' });
  });
});
