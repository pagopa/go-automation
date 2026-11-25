import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { anyStepEvidenceMatches, stepEvidenceMatches } from '../evidenceConditions.js';

describe('evidence conditions', () => {
  it('builds one contains predicate for one step and an OR for several', () => {
    const single = { type: 'contains', ref: 'steps.query-a', regex: 'timeout' };
    assert.deepStrictEqual(stepEvidenceMatches('query-a', 'timeout'), single);
    assert.deepStrictEqual(anyStepEvidenceMatches(['query-a'], 'timeout'), single);
    assert.deepStrictEqual(anyStepEvidenceMatches(['query-a', 'query-b'], 'timeout'), {
      type: 'or',
      conditions: [single, { type: 'contains', ref: 'steps.query-b', regex: 'timeout' }],
    });
  });

  it('rejects an empty list of evidence steps', () => {
    assert.throws(() => anyStepEvidenceMatches([], 'timeout'), /At least one evidence step id is required/);
  });
});
