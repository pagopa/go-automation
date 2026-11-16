import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { KnownCase } from '../../types/KnownCase.js';
import { findUnwiredKnownCaseStepRef } from '../findUnwiredKnownCaseStepRef.js';

function knownCase(id: string, ref: string): KnownCase {
  return {
    id,
    description: id,
    priority: 1,
    condition: { type: 'exists', ref },
    action: { type: 'log', level: 'info', title: id },
  };
}

describe('findUnwiredKnownCaseStepRef', () => {
  it('accepts references to wired steps and to non-step values', () => {
    const cases = [knownCase('c1', 'steps.query-foo'), knownCase('c2', 'vars.traceId')];
    assert.strictEqual(findUnwiredKnownCaseStepRef(cases, new Set(['query-foo'])), undefined);
  });

  it('returns the first unwired reference in declaration order', () => {
    const cases = [
      knownCase('c1', 'steps.query-foo'),
      knownCase('c2', 'steps.missing'),
      knownCase('c3', 'steps.other'),
    ];
    assert.deepStrictEqual(findUnwiredKnownCaseStepRef(cases, new Set(['query-foo'])), {
      caseId: 'c2',
      stepId: 'missing',
    });
  });
});
