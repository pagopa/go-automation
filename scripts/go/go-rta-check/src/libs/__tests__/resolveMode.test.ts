import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveMode } from '../resolveMode.js';

describe('resolveMode', () => {
  it('defaults to analyses so every existing invocation is unchanged', () => {
    assert.strictEqual(resolveMode(undefined), 'analyses');
  });

  it('accepts the declared modes regardless of case and padding', () => {
    assert.strictEqual(resolveMode('coverage'), 'coverage');
    assert.strictEqual(resolveMode('  COVERAGE '), 'coverage');
    assert.strictEqual(resolveMode('analyses'), 'analyses');
  });

  it('rejects an unknown mode instead of falling back silently', () => {
    assert.throws(() => resolveMode('covrage'), /mode non valido: covrage/);
  });
});
