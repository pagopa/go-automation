import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOTextExtractorRegistry } from '../GOTextExtractorRegistry.js';
import { GOPlainTextExtractor } from '../extractors/GOPlainTextExtractor.js';
import { writeTempFile } from './tempFile.js';

function plainTextRegistry(): GOTextExtractorRegistry {
  const registry = new GOTextExtractorRegistry();
  registry.register(new GOPlainTextExtractor());
  return registry;
}

describe('GOTextExtractorRegistry', () => {
  it('resolves by MIME type and falls back to the file extension', () => {
    const registry = plainTextRegistry();
    const cases: ReadonlyArray<readonly [string, string | undefined, boolean]> = [
      ['text/plain', undefined, true],
      ['text/markdown', undefined, true],
      ['application/zip', undefined, false],
      ['application/octet-stream', 'README.md', true],
      ['application/octet-stream', 'image.png', false],
    ];

    for (const [mimeType, fileName, expected] of cases) {
      assert.strictEqual(registry.canHandle(mimeType, fileName), expected, `${mimeType} ${fileName ?? ''}`);
    }
  });

  it('extracts via dispatch', async (t) => {
    const file = await writeTempFile(t, 'sample.md', '# hello');

    const result = await plainTextRegistry().extract('text/markdown', file);
    assert.strictEqual(result.text, '# hello');
  });

  it('throws when no extractor is registered for input', async () => {
    const registry = new GOTextExtractorRegistry();
    await assert.rejects(registry.extract('application/zip', '/tmp/nope.zip'), /No extractor registered/);
  });
});
