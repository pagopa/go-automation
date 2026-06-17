import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOEnv } from '../GOEnv.js';

describe('GOEnv', () => {
  it('get returns the value of a set variable from the injected source', () => {
    const env = new GOEnv({ FOO: 'bar' });
    assert.strictEqual(env.get('FOO'), 'bar');
  });

  it('get returns undefined for an unset variable', () => {
    const env = new GOEnv({ FOO: 'bar' });
    assert.strictEqual(env.get('MISSING'), undefined);
  });

  it('get preserves the raw value (no trimming)', () => {
    const env = new GOEnv({ PADDED: '  spaced  ' });
    assert.strictEqual(env.get('PADDED'), '  spaced  ');
  });

  it('has is true for a non-empty value', () => {
    const env = new GOEnv({ FOO: 'bar' });
    assert.strictEqual(env.has('FOO'), true);
  });

  it('has is false for an empty string and for an unset variable', () => {
    const env = new GOEnv({ EMPTY: '' });
    assert.strictEqual(env.has('EMPTY'), false);
    assert.strictEqual(env.has('MISSING'), false);
  });

  it('defaults to process.env when no source is provided', () => {
    const previous = process.env['GO_ENV_CLASS_PROBE'];
    process.env['GO_ENV_CLASS_PROBE'] = 'from-process';
    try {
      const env = new GOEnv();
      assert.strictEqual(env.get('GO_ENV_CLASS_PROBE'), 'from-process');
      assert.strictEqual(env.has('GO_ENV_CLASS_PROBE'), true);
    } finally {
      if (previous === undefined) {
        delete process.env['GO_ENV_CLASS_PROBE'];
      } else {
        process.env['GO_ENV_CLASS_PROBE'] = previous;
      }
    }
  });
});
