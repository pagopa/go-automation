import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOPdfTextExtractor } from '../GOPdfTextExtractor.js';
import { GOTextExtractionError } from '../../GOTextExtractionError.js';
import { writeTempFile } from '../../__tests__/tempFile.js';

describe('GOPdfTextExtractor', () => {
  const extractor = new GOPdfTextExtractor();

  it('throws GOTextExtractionError on a missing file', async () => {
    await assert.rejects(
      extractor.extract('/nonexistent/path/file.pdf'),
      (err) => err instanceof GOTextExtractionError && /Failed to read PDF/.test(err.message),
    );
  });

  it('throws GOTextExtractionError on a non-PDF payload', async (t) => {
    const file = await writeTempFile(t, 'not-a-pdf.pdf', 'this is not a pdf');

    await assert.rejects(
      extractor.extract(file),
      (err) => err instanceof GOTextExtractionError && /Failed to parse PDF/.test(err.message),
    );
  });
});
