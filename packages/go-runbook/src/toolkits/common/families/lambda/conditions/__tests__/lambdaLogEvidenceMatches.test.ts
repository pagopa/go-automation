import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lambdaLogEvidenceMatches } from '../lambdaLogEvidenceMatches.js';

describe('lambdaLogEvidenceMatches', () => {
  it('targets both standard Lambda log-query steps', () => {
    assert.deepStrictEqual(lambdaLogEvidenceMatches('socket hang up'), {
      type: 'or',
      conditions: [
        { type: 'contains', ref: 'steps.query-lambda-invocation', regex: 'socket hang up' },
        { type: 'contains', ref: 'steps.query-lambda-errors', regex: 'socket hang up' },
      ],
    });
  });
});
