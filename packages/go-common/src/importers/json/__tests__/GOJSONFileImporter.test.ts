import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';

import { GOJSONFileImporter } from '../GOJSONFileImporter.js';

const FIXTURES_DIR = path.join(import.meta.dirname, '__fixtures__');

function fixture(name: string): string {
  return path.join(FIXTURES_DIR, name);
}

describe('GOJSONFileImporter', () => {
  it('parses any top-level JSON value', async () => {
    const cases: ReadonlyArray<readonly [file: string, expected: unknown]> = [
      ['simple-object.json', { name: 'test', value: 42 }],
      ['array.json', [1, 2, 3]],
      ['string.json', 'hello'],
      ['null.json', null],
    ];
    for (const [file, expected] of cases) {
      assert.deepStrictEqual(await new GOJSONFileImporter({ inputPath: fixture(file) }).import(), expected, file);
    }
  });

  it('returns undefined for a missing optional file and throws ENOENT otherwise', async () => {
    const inputPath = fixture('non-existent.json');

    assert.strictEqual(await new GOJSONFileImporter({ inputPath, optional: true }).import(), undefined);
    await assert.rejects(new GOJSONFileImporter({ inputPath }).import(), { code: 'ENOENT' });
  });

  it('throws on invalid JSON even when optional is true', async () => {
    const importer = new GOJSONFileImporter({ inputPath: fixture('invalid.json'), optional: true });

    await assert.rejects(importer.import(), SyntaxError);
  });
});
