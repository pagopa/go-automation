/**
 * Tests for PatternsUtils
 *
 * Verifies loading ignore patterns from config file via GOJSONFileImporter
 * with fallback to built-in defaults when config is missing.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';

import { loadIgnorePatterns } from '../PatternsUtils.js';
import { Core } from '@go-automation/go-common';

const FIXTURES_DIR = path.join(import.meta.dirname, '__fixtures__');

describe('PatternsUtils', () => {
  describe('loadIgnorePatterns', () => {
    it('returns default patterns when config file does not exist', async () => {
      // The actual config file (../configs/ignore-patterns.json) doesn't exist
      // so loadIgnorePatterns should return the built-in defaults
      const patterns = await loadIgnorePatterns();

      assert.ok(patterns.length > 0);
      assert.ok(patterns.includes('-CumulativeAlarm'));
      assert.ok(patterns.includes('-DLQ-HasMessage'));
      assert.ok(patterns.includes('redshift-interop-analytics'));
    });

    it('returns a readonly array', async () => {
      const patterns = await loadIgnorePatterns();

      assert.ok(Array.isArray(patterns));
      assert.ok(patterns.length >= 10); // Default has 10 patterns
    });

    it('fixture config file is valid and parseable', async () => {
      const importer = new Core.GOJSONFileImporter<{ ignorePatterns: string[] }>({
        inputPath: path.join(FIXTURES_DIR, 'ignore-patterns-config.json'),
      });
      const config = await importer.import();

      assert.ok(config);
      assert.ok(Array.isArray(config.ignorePatterns));
      assert.strictEqual(config.ignorePatterns.length, 3);
      assert.ok(config.ignorePatterns.includes('-CumulativeAlarm'));
    });
  });
});
