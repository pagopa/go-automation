import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { GOPlainTextExtractor } from '../extractors/GOPlainTextExtractor.js';

async function writeTempFile(content: string | Buffer, ext: string = '.txt'): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'plain-extractor-'));
  const file = path.join(dir, `sample${ext}`);
  await fs.writeFile(file, content);
  return file;
}

describe('GOPlainTextExtractor', () => {
  const extractor = new GOPlainTextExtractor();

  it('declares the expected MIME types and extensions', () => {
    assert.ok(extractor.supportedMimeTypes.has('text/plain'));
    assert.ok(extractor.supportedMimeTypes.has('text/markdown'));
    assert.ok(extractor.supportedExtensions.has('.txt'));
    assert.ok(extractor.supportedExtensions.has('.md'));
  });

  it('extracts UTF-8 text', async () => {
    const file = await writeTempFile('Ciao mondo\n');
    const r = await extractor.extract(file);
    assert.strictEqual(r.text, 'Ciao mondo\n');
    assert.strictEqual(r.truncated, false);
  });

  it('strips UTF-8 BOM', async () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello', 'utf8')]);
    const file = await writeTempFile(buf);
    const r = await extractor.extract(file);
    assert.strictEqual(r.text, 'hello');
  });

  it('truncates above maxBytes', async () => {
    const file = await writeTempFile('A'.repeat(100));
    const r = await extractor.extract(file, { maxBytes: 10 });
    assert.strictEqual(r.text.length, 10);
    assert.strictEqual(r.truncated, true);
  });

  it('throws GOTextExtractionError on missing file', async () => {
    await assert.rejects(extractor.extract('/nonexistent/path/file.txt'), /Failed to read file/);
  });
});
