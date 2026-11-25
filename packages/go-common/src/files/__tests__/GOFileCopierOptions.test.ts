import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getDefaultSubdirForPathType } from '../GOFileCopierOptions.js';

describe('GOFileCopierOptions', () => {
  it('resolves default subdirectories by path type, root for unsupported types', () => {
    assert.strictEqual(getDefaultSubdirForPathType('input'), 'inputs');
    assert.strictEqual(getDefaultSubdirForPathType('config'), 'configs');
    assert.strictEqual(getDefaultSubdirForPathType('output'), null);
    assert.strictEqual(getDefaultSubdirForPathType('unknown' as never), null);
  });

  it('applies custom subdirectory defaults without mutating built-ins', () => {
    const customDefaults = { input: 'source-inputs', output: 'exports' };

    assert.strictEqual(getDefaultSubdirForPathType('input', customDefaults), 'source-inputs');
    assert.strictEqual(getDefaultSubdirForPathType('config', customDefaults), 'configs');
    assert.strictEqual(getDefaultSubdirForPathType('output', customDefaults), 'exports');
    assert.strictEqual(getDefaultSubdirForPathType('input'), 'inputs');
  });
});
