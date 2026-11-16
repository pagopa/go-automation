import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { GOPdfTextExtractor } from '../GOPdfTextExtractor.js';
import { GOTextExtractionError } from '../../GOTextExtractionError.js';

describe('GOPdfTextExtractor', () => {
  const extractor = new GOPdfTextExtractor();

  it('declares PDF MIME and .pdf extension', () => {
    assert.ok(extractor.supportedMimeTypes.has('application/pdf'));
    assert.ok(extractor.supportedExtensions.has('.pdf'));
  });

  it('throws GOTextExtractionError on a missing file', async () => {
    await assert.rejects(
      extractor.extract('/nonexistent/path/file.pdf'),
      (err) => err instanceof GOTextExtractionError && /Failed to read PDF/.test(err.message),
    );
  });

  it('throws GOTextExtractionError on a non-PDF payload', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-pdf-extractor-'));
    const file = path.join(dir, 'not-a-pdf.pdf');
    try {
      await fs.writeFile(file, Buffer.from('this is not a pdf'));
      await assert.rejects(
        extractor.extract(file),
        (err) => err instanceof GOTextExtractionError && /Failed to parse PDF/.test(err.message),
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
