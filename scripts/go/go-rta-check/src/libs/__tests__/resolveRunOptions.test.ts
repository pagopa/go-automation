import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Core } from '@go-automation/go-common';

import { resolveRunOptions } from '../resolveRunOptions.js';

describe('resolveRunOptions', () => {
  it('does not validate analyses-only matcher options in coverage mode', () => {
    let matcherWasResolved = false;
    const options = resolveRunOptions(
      new Core.GOLogger([]),
      {
        mode: 'coverage',
        analysisMatcher: 'invalid',
        goAiSemanticThreshold: 101,
        concurrency: Number.NaN,
      },
      () => {
        matcherWasResolved = true;
        throw new Error('matcher must not be resolved in coverage mode');
      },
    );

    assert.deepStrictEqual(options, { mode: 'coverage' });
    assert.strictEqual(matcherWasResolved, false);
  });

  it('still validates matcher options in analyses mode', () => {
    const options = resolveRunOptions(new Core.GOLogger([]), {
      mode: 'analyses',
      goAiSemanticThreshold: 101,
    });

    assert.strictEqual(options, undefined);
  });

  it('rejects analyses concurrency that is not a finite positive integer', () => {
    const invalidValues = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1, 1.5];

    for (const concurrency of invalidValues) {
      const options = resolveRunOptions(new Core.GOLogger([]), {
        mode: 'analyses',
        analysisMatcher: 'lexical',
        concurrency,
      });

      assert.strictEqual(options, undefined);
    }
  });
});
