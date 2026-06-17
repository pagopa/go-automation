import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GO_FILE_COPIER_DEFAULTS, getDefaultSubdirForPathType } from '../GOFileCopierOptions.js';

describe('GOFileCopierOptions', () => {
  it('defines built-in copy thresholds, manifest file and subdirectory defaults', () => {
    assert.strictEqual(GO_FILE_COPIER_DEFAULTS.PROMPT_THRESHOLD, 10 * 1024 * 1024);
    assert.strictEqual(GO_FILE_COPIER_DEFAULTS.MAX_FILE_SIZE, 100 * 1024 * 1024);
    assert.strictEqual(GO_FILE_COPIER_DEFAULTS.MANIFEST_FILE_NAME, 'files-manifest.json');
    assert.deepStrictEqual(GO_FILE_COPIER_DEFAULTS.SUBDIR_DEFAULTS, {
      input: 'inputs',
      config: 'configs',
      output: null,
    });
  });

  it('resolves default subdirectories by path type', () => {
    assert.strictEqual(getDefaultSubdirForPathType('input'), 'inputs');
    assert.strictEqual(getDefaultSubdirForPathType('config'), 'configs');
    assert.strictEqual(getDefaultSubdirForPathType('output'), null);
  });

  it('applies custom subdirectory defaults without mutating built-ins', () => {
    const customDefaults = {
      input: 'source-inputs',
      output: 'exports',
    };

    assert.strictEqual(getDefaultSubdirForPathType('input', customDefaults), 'source-inputs');
    assert.strictEqual(getDefaultSubdirForPathType('config', customDefaults), 'configs');
    assert.strictEqual(getDefaultSubdirForPathType('output', customDefaults), 'exports');
    assert.deepStrictEqual(GO_FILE_COPIER_DEFAULTS.SUBDIR_DEFAULTS, {
      input: 'inputs',
      config: 'configs',
      output: null,
    });
  });

  it('returns root for unsupported path types', () => {
    assert.strictEqual(getDefaultSubdirForPathType('unknown' as never), null);
  });
});
