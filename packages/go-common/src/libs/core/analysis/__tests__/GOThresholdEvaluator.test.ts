import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOThresholdEvaluator } from '../GOThresholdEvaluator.js';

describe('GOThresholdEvaluator', () => {
  it('evaluates any-row and aggregate threshold rules', () => {
    const evaluator = new GOThresholdEvaluator();
    const evaluation = evaluator.evaluate(
      [
        { hour: '10', count: '3' },
        { hour: '11', count: '8' },
      ],
      [
        { name: 'max-count', field: 'count', operator: '>', value: 5, aggregation: 'any-row' },
        { name: 'sum-count', field: 'count', operator: '>=', value: 11, aggregation: 'sum', severity: 'critical' },
      ],
    );

    assert.strictEqual(evaluation.breached, true);
    assert.deepStrictEqual(
      evaluation.results.map((result) => [result.rule.name, result.breached, result.observedValue, result.severity]),
      [
        ['max-count', true, 8, 'warning'],
        ['sum-count', true, 11, 'critical'],
      ],
    );
  });

  it('returns a neutral evaluation when no rules are configured', () => {
    const evaluation = new GOThresholdEvaluator().evaluate([], []);

    assert.strictEqual(evaluation.breached, false);
    assert.strictEqual(evaluation.summary, 'No threshold rules configured');
    assert.deepStrictEqual(evaluation.results, []);
  });
});
