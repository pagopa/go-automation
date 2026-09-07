import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { collectConditionStepRefs } from '../collectConditionStepRefs.js';
import type { Condition } from '../../types/Condition.js';

describe('collectConditionStepRefs', () => {
  it('collects the step id from every predicate kind', () => {
    const conditions: ReadonlyArray<Condition> = [
      { type: 'compare', ref: 'steps.a.output', operator: '==', value: '1' },
      { type: 'pattern', ref: 'steps.b', regex: 'x' },
      { type: 'exists', ref: 'steps.c.output[0]' },
      { type: 'contains', ref: 'steps.d', regex: 'y' },
    ];
    for (const condition of conditions) {
      assert.strictEqual(collectConditionStepRefs(condition).size, 1);
    }
  });

  it('ignores refs that do not point at a step', () => {
    assert.strictEqual(collectConditionStepRefs({ type: 'exists', ref: 'vars.traceId' }).size, 0);
    assert.strictEqual(collectConditionStepRefs({ type: 'exists', ref: 'params.alarmName' }).size, 0);
  });

  it('walks and/or/not so a nested reference is still found', () => {
    const condition: Condition = {
      type: 'and',
      conditions: [
        { type: 'exists', ref: 'steps.outer' },
        {
          type: 'not',
          condition: {
            type: 'or',
            conditions: [
              { type: 'exists', ref: 'steps.inner' },
              { type: 'exists', ref: 'vars.ignored' },
            ],
          },
        },
      ],
    };
    assert.deepStrictEqual([...collectConditionStepRefs(condition)].sort(), ['inner', 'outer']);
  });

  it('de-duplicates a step referenced more than once', () => {
    const condition: Condition = {
      type: 'or',
      conditions: [
        { type: 'exists', ref: 'steps.same.output' },
        { type: 'exists', ref: 'steps.same' },
      ],
    };
    assert.deepStrictEqual([...collectConditionStepRefs(condition)], ['same']);
  });

  it('ignores a bare "steps." ref carrying no id', () => {
    assert.strictEqual(collectConditionStepRefs({ type: 'exists', ref: 'steps.' }).size, 0);
  });
});
