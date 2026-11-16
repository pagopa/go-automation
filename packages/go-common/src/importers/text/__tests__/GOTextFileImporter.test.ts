/**
 * Tests for GOTextFileImporter
 *
 * Verifies plain text file reading with optional file handling,
 * encoding, multiline content, and error cases.
 * All test inputs are static fixtures in __fixtures__/.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';

import { GOTextFileImporter } from '../GOTextFileImporter.js';

const FIXTURES_DIR = path.join(import.meta.dirname, '__fixtures__');

function fixture(name: string): string {
  return path.join(FIXTURES_DIR, name);
}

describe('GOTextFileImporter', () => {
  it('reads a simple text file', async () => {
    const importer = new GOTextFileImporter({ inputPath: fixture('simple.txt') });
    const result = await importer.import();

    assert.strictEqual(result, 'Hello, world!');
  });

  it('reads a multiline file preserving newlines', async () => {
    const importer = new GOTextFileImporter({ inputPath: fixture('multiline.txt') });
    const result = await importer.import();

    assert.strictEqual(result, 'line one\nline two\nline three\n');
  });

  it('reads an empty file', async () => {
    const importer = new GOTextFileImporter({ inputPath: fixture('empty.txt') });
    const result = await importer.import();

    assert.strictEqual(result, '');
  });

  it('reads unicode content', async () => {
    const importer = new GOTextFileImporter({ inputPath: fixture('unicode.txt') });
    const result = await importer.import();

    assert.ok(result?.includes('Benvenuti'));
  });

  it('throws when file does not exist and optional is false', async () => {
    const importer = new GOTextFileImporter({ inputPath: fixture('non-existent.txt') });

    await assert.rejects(
      async () => importer.import(),
      (error: NodeJS.ErrnoException) => {
        assert.strictEqual(error.code, 'ENOENT');
        return true;
      },
    );
  });

  it('returns undefined when file does not exist and optional is true', async () => {
    const importer = new GOTextFileImporter({ inputPath: fixture('non-existent.txt'), optional: true });
    const result = await importer.import();

    assert.strictEqual(result, undefined);
  });
});
