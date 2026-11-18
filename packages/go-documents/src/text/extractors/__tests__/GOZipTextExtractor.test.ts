import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { GOTextExtractionError } from '../../GOTextExtractionError.js';
import type { GOTextExtractionResult } from '../../GOTextExtractionResult.js';
import type { GOTextExtractor } from '../../GOTextExtractor.js';
import { GOTextExtractorRegistry } from '../../GOTextExtractorRegistry.js';
import { GOZipTextExtractor } from '../GOZipTextExtractor.js';
import type { GOZipTextExtractorConfig } from '../GOZipTextExtractor.js';
import { writeTempFile } from '../../__tests__/tempFile.js';

const SAMPLE_ZIP_BASE64 =
  'UEsDBBQAAAgIAEFQE10az0w4FQAAABMAAAAFAAAAYS50eHQryEnMzFNIzCnISFRIzs8rSc0rAQBQSwMEFAAACAgAQVATXUAi7l8IAAAABgAAAAQAAABiLm1kU1ZISi1JBABQSwMEFAAACAgAQVATXfiuYcUUAAAAEgAAAAUAAABjLmJpbkvKzEssqlQoyElMTs3Iz0lJLQIAUEsBAhQDFAAACAgAQVATXRrPTDgVAAAAEwAAAAUAAAAAAAAAAAAAAKSBAAAAAGEudHh0UEsBAhQDFAAACAgAQVATXUAi7l8IAAAABgAAAAQAAAAAAAAAAAAAAKSBOAAAAGIubWRQSwECFAMUAAAICABBUBNd+K5hxRQAAAASAAAABQAAAAAAAAAAAAAApIFiAAAAYy5iaW5QSwUGAAAAAAMAAwCYAAAAmQAAAAAA';

class BinaryTextExtractor implements GOTextExtractor {
  public readonly supportedMimeTypes: ReadonlySet<string> = new Set();
  public readonly supportedExtensions: ReadonlySet<string> = new Set(['.bin']);

  public async extract(filePath: string): Promise<GOTextExtractionResult> {
    return {
      text: await fs.readFile(filePath, 'utf8'),
      pages: undefined,
      truncated: false,
    };
  }
}

describe('GOZipTextExtractor', () => {
  const extractor = new GOZipTextExtractor();
  // Holds a.txt, b.md and c.bin; written once and shared by the whole suite.
  let sampleDir = '';
  let sampleZip = '';

  before(async () => {
    sampleDir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-zip-extractor-'));
    sampleZip = path.join(sampleDir, 'sample.zip');
    await fs.writeFile(sampleZip, Buffer.from(SAMPLE_ZIP_BASE64, 'base64'));
  });

  after(async () => fs.rm(sampleDir, { recursive: true, force: true }));

  it('extracts text-like entries without buffering unsupported entries', async () => {
    const result = await extractor.extract(sampleZip);

    assert.match(result.text, /--- a\.txt ---/);
    assert.match(result.text, /plain alpha content/);
    assert.match(result.text, /--- b\.md ---/);
    assert.match(result.text, /# beta/);
    assert.match(result.text, /--- c\.bin ---/);
    assert.doesNotMatch(result.text, /binary placeholder/);
    assert.equal(result.truncated, false);
  });

  it('streams supported binary entries through the supplied registry', async () => {
    const registry = new GOTextExtractorRegistry();
    registry.register(new BinaryTextExtractor());

    const result = await new GOZipTextExtractor({ registry }).extract(sampleZip);

    assert.match(result.text, /--- c\.bin ---/);
    assert.match(result.text, /binary placeholder/);
  });

  it('stops streaming and marks the result when maxBytes is reached', async () => {
    const result = await extractor.extract(sampleZip, { maxBytes: 20 });

    assert.equal(Buffer.byteLength(result.text, 'utf8') <= 20, true);
    assert.equal(result.truncated, true);
    assert.match(result.text, /--- a\.txt ---/);
  });

  it('rejects archives over the entry, entry-size and total decompression limits', async () => {
    const cases: ReadonlyArray<readonly [GOZipTextExtractorConfig, RegExp]> = [
      [{ maxEntries: 2 }, /ZIP entry limit exceeded/],
      [{ maxEntryBytes: 18 }, /decompressed size limit/],
      [{ maxExpandedBytes: 20 }, /expanded data exceeds/],
    ];

    for (const [options, message] of cases) {
      await assert.rejects(
        new GOZipTextExtractor(options).extract(sampleZip),
        (error) => error instanceof GOTextExtractionError && message.test(error.message),
      );
    }
  });

  it('honours an already-aborted signal', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    controller.abort(reason);

    await assert.rejects(extractor.extract('/unused.zip', { signal: controller.signal }), reason);
  });

  it('throws GOTextExtractionError on a malformed ZIP', async (t) => {
    const file = await writeTempFile(t, 'bad.zip', 'not a zip');

    await assert.rejects(
      extractor.extract(file),
      (error) => error instanceof GOTextExtractionError && /Failed to open ZIP/.test(error.message),
    );
  });
});
