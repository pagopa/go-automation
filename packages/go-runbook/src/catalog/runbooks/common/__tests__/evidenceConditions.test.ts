import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { anyStepEvidenceMatches, lambdaLogEvidenceMatches, stepEvidenceMatches } from '../evidenceConditions.js';

describe('evidence conditions', () => {
  it('builds a condition for one step', () => {
    assert.deepStrictEqual(stepEvidenceMatches('query-errors', 'ECONNRESET'), {
      type: 'contains',
      ref: 'steps.query-errors',
      regex: 'ECONNRESET',
    });
    assert.deepStrictEqual(anyStepEvidenceMatches(['query-errors'], 'ECONNRESET'), {
      type: 'contains',
      ref: 'steps.query-errors',
      regex: 'ECONNRESET',
    });
  });

  it('builds an OR condition for multiple steps', () => {
    assert.deepStrictEqual(anyStepEvidenceMatches(['query-a', 'query-b'], 'timeout'), {
      type: 'or',
      conditions: [
        { type: 'contains', ref: 'steps.query-a', regex: 'timeout' },
        { type: 'contains', ref: 'steps.query-b', regex: 'timeout' },
      ],
    });
  });

  it('rejects an empty list of evidence steps', () => {
    assert.throws(() => anyStepEvidenceMatches([], 'timeout'), /At least one evidence step id is required/);
  });

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
