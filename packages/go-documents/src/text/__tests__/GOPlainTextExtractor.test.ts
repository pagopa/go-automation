import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOPlainTextExtractor } from '../extractors/GOPlainTextExtractor.js';
import { writeTempFile } from './tempFile.js';

describe('GOPlainTextExtractor', () => {
  const extractor = new GOPlainTextExtractor();

  it('extracts UTF-8 text', async (t) => {
    const r = await extractor.extract(await writeTempFile(t, 'sample.txt', 'Ciao mondo\n'));
    assert.strictEqual(r.text, 'Ciao mondo\n');
    assert.strictEqual(r.truncated, false);
  });

  it('strips UTF-8 BOM', async (t) => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello', 'utf8')]);
    const r = await extractor.extract(await writeTempFile(t, 'sample.txt', buf));
    assert.strictEqual(r.text, 'hello');
  });

  it('truncates above maxBytes', async (t) => {
    const r = await extractor.extract(await writeTempFile(t, 'sample.txt', 'A'.repeat(100)), { maxBytes: 10 });
    assert.strictEqual(r.text.length, 10);
    assert.strictEqual(r.truncated, true);
  });

  it('throws GOTextExtractionError on missing file', async () => {
    await assert.rejects(extractor.extract('/nonexistent/path/file.txt'), /Failed to read file/);
  });
});
