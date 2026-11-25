/**
 * Tests for PatternsUtils
 *
 * Verifies loading ignore patterns from the config file resolved through
 * GOConfigFallbackContext, with fallback to built-in defaults when it is missing.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';

import { loadIgnorePatterns } from '../PatternsUtils.js';
import { GOPaths } from '@go-automation/go-script';

const FIXTURES_DIR = path.join(import.meta.dirname, '__fixtures__');

/** GOPaths resolving the config file to a fixed path, independent of the machine's data directory. */
class FixedConfigPaths extends GOPaths {
  constructor(private readonly configPath: string) {
    super('go-report-alarms');
  }

  public override getConfigFilePath(): string {
    return this.configPath;
  }
}

describe('loadIgnorePatterns', () => {
  it('reads the patterns from the config file when it exists', async () => {
    const paths = new FixedConfigPaths(path.join(FIXTURES_DIR, 'ignore-patterns-config.json'));

    assert.deepStrictEqual(await loadIgnorePatterns({ paths }), [
      '-CumulativeAlarm',
      '-DLQ-HasMessage',
      'custom-ignore-pattern',
    ]);
  });

  it('falls back to the built-in defaults when the config file does not exist', async () => {
    const paths = new FixedConfigPaths(path.join(FIXTURES_DIR, 'does-not-exist.json'));

    const patterns = await loadIgnorePatterns({ paths });

    assert.ok(patterns.includes('-CumulativeAlarm'));
    assert.ok(patterns.includes('redshift-interop-analytics'));
  });
});
