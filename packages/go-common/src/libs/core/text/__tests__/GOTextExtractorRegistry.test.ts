import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { GOTextExtractorRegistry } from '../GOTextExtractorRegistry.js';
import { GOPlainTextExtractor } from '../extractors/GOPlainTextExtractor.js';

describe('GOTextExtractorRegistry', () => {
  it('canHandle resolves by MIME type', () => {
    const registry = new GOTextExtractorRegistry();
    registry.register(new GOPlainTextExtractor());
    assert.ok(registry.canHandle('text/plain'));
    assert.ok(registry.canHandle('text/markdown'));
    assert.ok(!registry.canHandle('application/zip'));
  });

  it('falls back to file extension when MIME is unknown', () => {
    const registry = new GOTextExtractorRegistry();
    registry.register(new GOPlainTextExtractor());
    assert.ok(registry.canHandle('application/octet-stream', 'README.md'));
    assert.ok(!registry.canHandle('application/octet-stream', 'image.png'));
  });

  it('extracts via dispatch', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'registry-'));
    const file = path.join(dir, 'sample.md');
    await fs.writeFile(file, '# hello');

    const registry = new GOTextExtractorRegistry();
    registry.register(new GOPlainTextExtractor());

    const result = await registry.extract('text/markdown', file);
    assert.strictEqual(result.text, '# hello');
  });

  it('throws when no extractor is registered for input', async () => {
    const registry = new GOTextExtractorRegistry();
    await assert.rejects(registry.extract('application/zip', '/tmp/nope.zip'), /No extractor registered/);
  });
});
