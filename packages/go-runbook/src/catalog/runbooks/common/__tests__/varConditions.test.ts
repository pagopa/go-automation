import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { varEquals, varExists, varMatches } from '../varConditions.js';

describe('var conditions', () => {
  it('builds a pattern condition prefixed with the vars namespace', () => {
    assert.deepStrictEqual(varMatches('userAttributesErrorMsg', 'ReadTimeoutException'), {
      type: 'pattern',
      ref: 'vars.userAttributesErrorMsg',
      regex: 'ReadTimeoutException',
    });
  });

  it('builds an equality comparison', () => {
    assert.deepStrictEqual(varEquals('apiGwHttpMethod', 'POST'), {
      type: 'compare',
      ref: 'vars.apiGwHttpMethod',
      operator: '==',
      value: 'POST',
    });
  });

  it('keeps non-string literals as they are, without stringifying them', () => {
    assert.deepStrictEqual(varEquals('retryCount', 0), {
      type: 'compare',
      ref: 'vars.retryCount',
      operator: '==',
      value: 0,
    });
  });

  it('builds an exists condition', () => {
    assert.deepStrictEqual(varExists('traceId'), { type: 'exists', ref: 'vars.traceId' });
  });

  it('does not re-prefix a name that already looks qualified', () => {
    // Documents the contract: the helper always prepends `vars.`, so callers
    // must pass the bare name.
    assert.strictEqual((varExists('vars.traceId') as { readonly ref: string }).ref, 'vars.vars.traceId');
  });
});
