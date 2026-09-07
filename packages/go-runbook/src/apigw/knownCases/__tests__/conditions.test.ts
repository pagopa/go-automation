import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { apiGwPathMatches, apiGwStatusIs } from '../conditions.js';

describe('API Gateway known-case conditions', () => {
  it('targets the canonical API Gateway status variable', () => {
    assert.deepStrictEqual(apiGwStatusIs('504'), {
      type: 'compare',
      ref: 'vars.apiGwStatusCode',
      operator: '==',
      value: '504',
    });
  });

  it('targets the canonical API Gateway path variable', () => {
    assert.deepStrictEqual(apiGwPathMatches('/notifications/[^/]+$'), {
      type: 'pattern',
      ref: 'vars.apiGwPath',
      regex: '/notifications/[^/]+$',
    });
  });
});
