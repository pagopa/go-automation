import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOEnv } from '../GOEnv.js';

describe('GOEnv', () => {
  it('get returns the raw value of the injected source, or undefined when unset', () => {
    const env = new GOEnv({ FOO: 'bar', PADDED: '  spaced  ' });
    assert.strictEqual(env.get('FOO'), 'bar');
    assert.strictEqual(env.get('PADDED'), '  spaced  ');
    assert.strictEqual(env.get('MISSING'), undefined);
  });

  it('has is true only for a non-empty value', () => {
    const env = new GOEnv({ FOO: 'bar', EMPTY: '' });
    assert.strictEqual(env.has('FOO'), true);
    assert.strictEqual(env.has('EMPTY'), false);
    assert.strictEqual(env.has('MISSING'), false);
  });

  it('defaults to process.env when no source is provided', (t) => {
    const previous = process.env['GO_ENV_CLASS_PROBE'];
    t.after(() => {
      if (previous === undefined) delete process.env['GO_ENV_CLASS_PROBE'];
      else process.env['GO_ENV_CLASS_PROBE'] = previous;
    });
    process.env['GO_ENV_CLASS_PROBE'] = 'from-process';

    const env = new GOEnv();
    assert.strictEqual(env.get('GO_ENV_CLASS_PROBE'), 'from-process');
    assert.strictEqual(env.has('GO_ENV_CLASS_PROBE'), true);
  });
});
