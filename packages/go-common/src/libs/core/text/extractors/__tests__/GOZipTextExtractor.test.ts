import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import type AdmZipModule from 'adm-zip';

import { GOZipTextExtractor } from '../GOZipTextExtractor.js';
import { GOTextExtractorRegistry } from '../../GOTextExtractorRegistry.js';
import { GOPlainTextExtractor } from '../GOPlainTextExtractor.js';
import { GOTextExtractionError } from '../../GOTextExtractionError.js';

const requireCjs = createRequire(import.meta.url);
const AdmZipCtor = requireCjs('adm-zip') as new () => AdmZipModule;

function makeZip(filePath: string, entries: ReadonlyArray<{ readonly name: string; readonly content: string }>): void {
  const zip = new AdmZipCtor();
  for (const entry of entries) {
    zip.addFile(entry.name, Buffer.from(entry.content, 'utf8'));
  }
  zip.writeZip(filePath);
}

describe('GOZipTextExtractor', () => {
  const extractor = new GOZipTextExtractor();

  it('declares ZIP MIME and .zip extension', () => {
    assert.ok(extractor.supportedMimeTypes.has('application/zip'));
    assert.ok(extractor.supportedExtensions.has('.zip'));
  });

  it('extracts text from text-like entries (without a registry)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-zip-extractor-'));
    const file = path.join(dir, 'sample.zip');
    try {
      makeZip(file, [
        { name: 'a.txt', content: 'plain alpha content' },
        { name: 'b.md', content: '# beta' },
        { name: 'c.bin', content: 'binary placeholder' },
      ]);
      const result = await extractor.extract(file);
      assert.match(result.text, /--- a\.txt ---/);
      assert.match(result.text, /plain alpha content/);
      assert.match(result.text, /--- b\.md ---/);
      assert.match(result.text, /# beta/);
      // c.bin is unsupported without a registry and has no body recovered.
      assert.match(result.text, /--- c\.bin ---/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('dispatches binary entries through the supplied registry', async () => {
    const registry = new GOTextExtractorRegistry();
    registry.register(new GOPlainTextExtractor());
    const withRegistry = new GOZipTextExtractor({ registry });

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-zip-extractor-'));
    const file = path.join(dir, 'sample.zip');
    try {
      makeZip(file, [{ name: 'note.txt', content: 'recursive text' }]);
      const result = await withRegistry.extract(file);
      assert.match(result.text, /recursive text/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('throws GOTextExtractionError on a malformed ZIP', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-zip-extractor-'));
    const file = path.join(dir, 'bad.zip');
    try {
      await fs.writeFile(file, Buffer.from('not a zip'));
      await assert.rejects(
        extractor.extract(file),
        (err) => err instanceof GOTextExtractionError && /Failed to open ZIP/.test(err.message),
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
