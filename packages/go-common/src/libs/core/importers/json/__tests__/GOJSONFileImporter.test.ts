/**
 * Tests for GOJSONFileImporter
 *
 * Verifies single-object JSON file reading with typed output,
 * optional file handling, encoding, and error cases.
 * All test inputs are static fixtures in __fixtures__/.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';

import { GOJSONFileImporter } from '../GOJSONFileImporter.js';

const FIXTURES_DIR = path.join(import.meta.dirname, '__fixtures__');

function fixture(name: string): string {
  return path.join(FIXTURES_DIR, name);
}

describe('GOJSONFileImporter', () => {
  it('reads a simple object', async () => {
    const importer = new GOJSONFileImporter<{ name: string; value: number }>({
      inputPath: fixture('simple-object.json'),
    });
    const result = await importer.import();

    assert.deepStrictEqual(result, { name: 'test', value: 42 });
  });

  it('reads a nested object preserving structure', async () => {
    const importer = new GOJSONFileImporter({ inputPath: fixture('nested-object.json') });
    const result = await importer.import();

    assert.deepStrictEqual(result, {
      metadata: { version: '1.0.0' },
      items: [{ id: 1 }, { id: 2 }],
    });
  });

  it('reads an array as top-level value', async () => {
    const importer = new GOJSONFileImporter<number[]>({ inputPath: fixture('array.json') });
    const result = await importer.import();

    assert.deepStrictEqual(result, [1, 2, 3]);
  });

  it('reads a string as top-level value', async () => {
    const importer = new GOJSONFileImporter<string>({ inputPath: fixture('string.json') });
    const result = await importer.import();

    assert.strictEqual(result, 'hello');
  });

  it('reads null as top-level value', async () => {
    const importer = new GOJSONFileImporter({ inputPath: fixture('null.json') });
    const result = await importer.import();

    assert.strictEqual(result, null);
  });

  it('throws when file does not exist and optional is false', async () => {
    const importer = new GOJSONFileImporter({ inputPath: fixture('non-existent.json') });

    await assert.rejects(
      async () => importer.import(),
      (error: NodeJS.ErrnoException) => {
        assert.strictEqual(error.code, 'ENOENT');
        return true;
      },
    );
  });

  it('returns undefined when file does not exist and optional is true', async () => {
    const importer = new GOJSONFileImporter({ inputPath: fixture('non-existent.json'), optional: true });
    const result = await importer.import();

    assert.strictEqual(result, undefined);
  });

  it('throws on invalid JSON even when optional is true', async () => {
    const importer = new GOJSONFileImporter({ inputPath: fixture('invalid.json'), optional: true });

    await assert.rejects(async () => importer.import(), SyntaxError);
  });

  it('reads pretty-printed JSON', async () => {
    const importer = new GOJSONFileImporter({ inputPath: fixture('pretty-printed.json') });
    const result = await importer.import();

    assert.deepStrictEqual(result, { key: 'value', nested: { a: 1 } });
  });
});
