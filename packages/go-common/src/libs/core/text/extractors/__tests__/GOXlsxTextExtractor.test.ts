import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { GOXlsxTextExtractor } from '../GOXlsxTextExtractor.js';
import { GOTextExtractionError } from '../../GOTextExtractionError.js';

// `sample.xlsx` is a static fixture (committed under __fixtures__/) with two sheets:
//   Sheet1: header row, two data rows, and one empty row that must be dropped
//   Totals: a single row
const FIXTURES_DIR = path.join(import.meta.dirname, '__fixtures__');

describe('GOXlsxTextExtractor', () => {
  const extractor = new GOXlsxTextExtractor();

  it('declares XLSX MIME and .xlsx extension', () => {
    assert.ok(extractor.supportedMimeTypes.has('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
    assert.ok(extractor.supportedExtensions.has('.xlsx'));
  });

  it('extracts every sheet as tab-separated rows and drops empty rows', async () => {
    const result = await extractor.extract(path.join(FIXTURES_DIR, 'sample.xlsx'));

    // Both sheets are emitted, each prefixed by its header.
    assert.match(result.text, /--- Sheet: Sheet1 ---/);
    assert.match(result.text, /--- Sheet: Totals ---/);

    // Cells are joined with tabs; numbers are stringified.
    assert.match(result.text, /Name\tScore/);
    assert.match(result.text, /alice\t42/);
    assert.match(result.text, /bob\t17/);
    assert.match(result.text, /Total\t59/);

    // The empty row between the data rows is dropped: no blank line slips through.
    const sheet1Lines = result.text.split('\n').filter((line) => line.length > 0);
    assert.ok(sheet1Lines.length > 0);
    assert.ok(!sheet1Lines.includes(''));

    assert.strictEqual(result.truncated, false);
    assert.strictEqual(result.pages, undefined);
  });

  it('truncates output when it exceeds maxBytes', async () => {
    const result = await extractor.extract(path.join(FIXTURES_DIR, 'sample.xlsx'), { maxBytes: 8 });

    assert.strictEqual(result.truncated, true);
    assert.ok(Buffer.byteLength(result.text, 'utf-8') <= 8);
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
