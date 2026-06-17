import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOConfigParameterType } from '../../GOConfigParameterType.js';
import { GOConfigSchema } from '../../GOConfigSchema.js';
import { GOUnknownParameterDetector } from '../GOUnknownParameterDetector.js';

function createSchema(): GOConfigSchema {
  const schema = new GOConfigSchema();

  schema.addParameters([
    {
      name: 'start.date',
      type: GOConfigParameterType.STRING,
      aliases: ['sd', '--from-date'],
    },
    {
      name: 'verbose',
      type: GOConfigParameterType.BOOL,
      aliases: ['v'],
    },
    {
      name: 'batch.size',
      type: GOConfigParameterType.INT,
    },
  ]);

  return schema;
}

describe('GOUnknownParameterDetector', () => {
  it('accepts schema flags, aliases and built-in help flags', () => {
    const errors = GOUnknownParameterDetector.detect(
      ['start-date', 'sd', 'from-date', 'verbose', 'v', 'batch-size', 'help', 'h'],
      createSchema(),
    );

    assert.deepStrictEqual(errors, []);
  });

  it('reports unknown flags with closest suggestions when distance is small enough', () => {
    const errors = GOUnknownParameterDetector.detect(['strat-date', 'verbos', 'unrelated'], createSchema());

    assert.strictEqual(errors.length, 3);
    assert.deepStrictEqual(errors[0], {
      flag: 'strat-date',
      suggestion: {
        flag: '--start-date',
        distance: 1,
      },
    });
    assert.deepStrictEqual(errors[1], {
      flag: 'verbos',
      suggestion: {
        flag: '--verbose',
        distance: 1,
      },
    });
    assert.deepStrictEqual(errors[2], {
      flag: 'unrelated',
      suggestion: undefined,
    });
  });

  it('limits suggestions for very short flags to exact-near matches', () => {
    const errors = GOUnknownParameterDetector.detect(['zz', 'vv'], createSchema());

    assert.deepStrictEqual(errors, [
      {
        flag: 'zz',
        suggestion: undefined,
      },
      {
        flag: 'vv',
        suggestion: {
          flag: '--v',
          distance: 1,
        },
      },
    ]);
  });

  it('formats one or more unknown parameter errors', () => {
    const message = GOUnknownParameterDetector.formatErrorMessage([
      {
        flag: 'strat-date',
        suggestion: {
          flag: '--start-date',
          distance: 1,
        },
      },
      {
        flag: 'unrelated',
        suggestion: undefined,
      },
    ]);

    assert.strictEqual(
      message,
      [
        'Unknown parameter(s):',
        '',
        '  --strat-date    Did you mean --start-date?',
        '  --unrelated',
        '',
        'Run with --help to see all available parameters.\n',
      ].join('\n'),
    );
  });
});
