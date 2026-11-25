import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';

import { GOTextFileImporter } from '../GOTextFileImporter.js';

const FIXTURES_DIR = path.join(import.meta.dirname, '__fixtures__');

describe('GOTextFileImporter', () => {
  it('reads the file content verbatim, newlines included', async () => {
    const importer = new GOTextFileImporter({ inputPath: path.join(FIXTURES_DIR, 'multiline.txt') });

    assert.strictEqual(await importer.import(), 'line one\nline two\nline three\n');
  });

  it('returns undefined for a missing optional file and throws ENOENT otherwise', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'non-existent.txt');

    assert.strictEqual(await new GOTextFileImporter({ inputPath, optional: true }).import(), undefined);
    await assert.rejects(new GOTextFileImporter({ inputPath }).import(), { code: 'ENOENT' });
  });
});
