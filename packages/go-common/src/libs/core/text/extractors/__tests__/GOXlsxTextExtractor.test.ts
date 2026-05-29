import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { GOXlsxTextExtractor } from '../GOXlsxTextExtractor.js';
import { GOTextExtractionError } from '../../GOTextExtractionError.js';

describe('GOXlsxTextExtractor', () => {
  const extractor = new GOXlsxTextExtractor();

  it('declares XLSX MIME and .xlsx extension', () => {
    assert.ok(extractor.supportedMimeTypes.has('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
    assert.ok(extractor.supportedExtensions.has('.xlsx'));
  });

  it('throws GOTextExtractionError on a malformed XLSX', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-xlsx-extractor-'));
    const file = path.join(dir, 'bad.xlsx');
    try {
      await fs.writeFile(file, Buffer.from('not an xlsx'));
      await assert.rejects(
        extractor.extract(file),
        (err) => err instanceof GOTextExtractionError && /Failed to parse XLSX/.test(err.message),
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
