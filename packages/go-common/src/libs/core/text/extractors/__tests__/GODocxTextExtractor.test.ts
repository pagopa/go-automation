import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { GODocxTextExtractor } from '../GODocxTextExtractor.js';
import { GOTextExtractionError } from '../../GOTextExtractionError.js';

describe('GODocxTextExtractor', () => {
  const extractor = new GODocxTextExtractor();

  it('declares DOCX MIME and .docx extension', () => {
    assert.ok(
      extractor.supportedMimeTypes.has('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    );
    assert.ok(extractor.supportedExtensions.has('.docx'));
  });

  it('throws GOTextExtractionError on a malformed DOCX', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-docx-extractor-'));
    const file = path.join(dir, 'bad.docx');
    try {
      await fs.writeFile(file, Buffer.from('not a docx file'));
      await assert.rejects(
        extractor.extract(file),
        (err) => err instanceof GOTextExtractionError && /Failed to parse DOCX/.test(err.message),
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
