import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { GOTextExtractionError } from '../../GOTextExtractionError.js';
import type { GOTextExtractionResult } from '../../GOTextExtractionResult.js';
import type { GOTextExtractor } from '../../GOTextExtractor.js';
import { GOTextExtractorRegistry } from '../../GOTextExtractorRegistry.js';
import { GOZipTextExtractor } from '../GOZipTextExtractor.js';

const SAMPLE_ZIP_BASE64 =
  'UEsDBBQAAAgIAEFQE10az0w4FQAAABMAAAAFAAAAYS50eHQryEnMzFNIzCnISFRIzs8rSc0rAQBQSwMEFAAACAgAQVATXUAi7l8IAAAABgAAAAQAAABiLm1kU1ZISi1JBABQSwMEFAAACAgAQVATXfiuYcUUAAAAEgAAAAUAAABjLmJpbkvKzEssqlQoyElMTs3Iz0lJLQIAUEsBAhQDFAAACAgAQVATXRrPTDgVAAAAEwAAAAUAAAAAAAAAAAAAAKSBAAAAAGEudHh0UEsBAhQDFAAACAgAQVATXUAi7l8IAAAABgAAAAQAAAAAAAAAAAAAAKSBOAAAAGIubWRQSwECFAMUAAAICABBUBNd+K5hxRQAAAASAAAABQAAAAAAAAAAAAAApIFiAAAAYy5iaW5QSwUGAAAAAAMAAwCYAAAAmQAAAAAA';

async function writeSampleZip(filePath: string): Promise<void> {
  await fs.writeFile(filePath, Buffer.from(SAMPLE_ZIP_BASE64, 'base64'));
}

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

  it('declares ZIP MIME and .zip extension', () => {
    assert.ok(extractor.supportedMimeTypes.has('application/zip'));
    assert.ok(extractor.supportedExtensions.has('.zip'));
  });

  it('extracts text-like entries without buffering unsupported entries', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-zip-extractor-'));
    const file = path.join(dir, 'sample.zip');
    try {
      await writeSampleZip(file);
      const result = await extractor.extract(file);

      assert.match(result.text, /--- a\.txt ---/);
      assert.match(result.text, /plain alpha content/);
      assert.match(result.text, /--- b\.md ---/);
      assert.match(result.text, /# beta/);
      assert.match(result.text, /--- c\.bin ---/);
      assert.doesNotMatch(result.text, /binary placeholder/);
      assert.equal(result.truncated, false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('streams supported binary entries through the supplied registry', async () => {
    const registry = new GOTextExtractorRegistry();
    registry.register(new BinaryTextExtractor());
    const withRegistry = new GOZipTextExtractor({ registry });

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-zip-extractor-'));
    const file = path.join(dir, 'sample.zip');
    try {
      await writeSampleZip(file);
      const result = await withRegistry.extract(file);

      assert.match(result.text, /--- c\.bin ---/);
      assert.match(result.text, /binary placeholder/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('stops streaming and marks the result when maxBytes is reached', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-zip-extractor-'));
    const file = path.join(dir, 'sample.zip');
    try {
      await writeSampleZip(file);
      const result = await extractor.extract(file, { maxBytes: 20 });

      assert.equal(Buffer.byteLength(result.text, 'utf8') <= 20, true);
      assert.equal(result.truncated, true);
      assert.match(result.text, /--- a\.txt ---/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects archives that exceed the configured entry limit', async () => {
    const limited = new GOZipTextExtractor({ maxEntries: 2 });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-zip-extractor-'));
    const file = path.join(dir, 'sample.zip');
    try {
      await writeSampleZip(file);
      await assert.rejects(
        limited.extract(file),
        (error) => error instanceof GOTextExtractionError && /ZIP entry limit exceeded/.test(error.message),
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects entries whose declared decompressed size exceeds the configured limit', async () => {
    const limited = new GOZipTextExtractor({ maxEntryBytes: 18 });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-zip-extractor-'));
    const file = path.join(dir, 'sample.zip');
    try {
      await writeSampleZip(file);
      await assert.rejects(
        limited.extract(file),
        (error) => error instanceof GOTextExtractionError && /decompressed size limit/.test(error.message),
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('counts streamed bytes against the total decompression budget', async () => {
    const limited = new GOZipTextExtractor({ maxExpandedBytes: 20 });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-zip-extractor-'));
    const file = path.join(dir, 'sample.zip');
    try {
      await writeSampleZip(file);
      await assert.rejects(
        limited.extract(file),
        (error) => error instanceof GOTextExtractionError && /expanded data exceeds/.test(error.message),
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('honours an already-aborted signal', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    controller.abort(reason);

    await assert.rejects(extractor.extract('/unused.zip', { signal: controller.signal }), reason);
  });

  it('throws GOTextExtractionError on a malformed ZIP', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-zip-extractor-'));
    const file = path.join(dir, 'bad.zip');
    try {
      await fs.writeFile(file, Buffer.from('not a zip'));
      await assert.rejects(
        extractor.extract(file),
        (error) => error instanceof GOTextExtractionError && /Failed to open ZIP/.test(error.message),
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
