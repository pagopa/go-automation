import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { KnownError } from '../../types/KnownError.js';
import { findUnwiredKnownErrorStepRef } from '../findUnwiredKnownErrorStepRef.js';

function knownError(id: string, ref: string): KnownError {
  return {
    code: id,
    description: id,
    condition: { type: 'exists', ref },
    action: { type: 'log', level: 'info', title: id },
  };
}

describe('findUnwiredKnownErrorStepRef', () => {
  it('accepts references to wired steps and to non-step values', () => {
    const cases = [knownError('c1', 'steps.query-foo'), knownError('c2', 'vars.traceId')];
    assert.strictEqual(findUnwiredKnownErrorStepRef(cases, new Set(['query-foo'])), undefined);
  });

  it('returns the first unwired reference in declaration order', () => {
    const cases = [
      knownError('c1', 'steps.query-foo'),
      knownError('c2', 'steps.missing'),
      knownError('c3', 'steps.other'),
    ];
    assert.deepStrictEqual(findUnwiredKnownErrorStepRef(cases, new Set(['query-foo'])), {
      knownErrorCode: 'c2',
      stepId: 'missing',
    });
  });
});
