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
});
