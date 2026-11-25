import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseThresholdRules } from '../parseThresholdRules.js';
import { createConfig } from './helpers/createConfig.js';

describe('parseThresholdRules', () => {
  it('allows count aggregation without field', () => {
    assert.deepStrictEqual(
      parseThresholdRules(createConfig({ analysisRules: ['name=row-count;operator=>=;value=10;aggregation=count'] })),
      [{ name: 'row-count', operator: '>=', value: 10, aggregation: 'count', severity: 'warning' }],
    );
  });

  it('keeps legacy threshold compatibility', () => {
    assert.deepStrictEqual(
      parseThresholdRules(createConfig({ analysisThresholdField: 'total', analysisThreshold: 100 })),
      [
        {
          name: 'legacy-threshold',
          field: 'total',
          operator: '>',
          value: 100,
          aggregation: 'any-row',
          severity: 'warning',
        },
      ],
    );
  });

  it('rejects invalid rules with the analysis.rules index context', () => {
    const invalidValue = /Invalid numeric value for analysis\.rules\[0\]\.value/;
    const cases: ReadonlyArray<readonly [string, RegExp]> = [
      ['name=missing-field;operator=>;value=10', /analysis\.rules\[0\].*field is required/],
      ['{"name":"broken"', /Invalid JSON analysis rule at analysis\.rules\[0\]/],
      ['name=empty-value;field=total;operator=>;value=', invalidValue],
      ['{"name":"null-value","field":"total","operator":">","value":null}', invalidValue],
      ['{"name":"boolean-value","field":"total","operator":">","value":true}', invalidValue],
    ];
    for (const [rule, message] of cases) {
      assert.throws(() => parseThresholdRules(createConfig({ analysisRules: [rule] })), message, rule);
    }
  });
});
