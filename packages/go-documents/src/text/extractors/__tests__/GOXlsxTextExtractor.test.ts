import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { GOXlsxTextExtractor } from '../GOXlsxTextExtractor.js';
import { GOTextExtractionError } from '../../GOTextExtractionError.js';
import { writeTempFile } from '../../__tests__/tempFile.js';

// `sample.xlsx` is a static fixture (committed under __fixtures__/) with two sheets:
//   Sheet1: header row, two data rows, and one empty row that must be dropped
//   Totals: a single row
const FIXTURES_DIR = path.join(import.meta.dirname, '__fixtures__');

describe('GOXlsxTextExtractor', () => {
  const extractor = new GOXlsxTextExtractor();

  it('extracts every sheet as tab-separated rows and drops empty rows', async () => {
    const result = await extractor.extract(path.join(FIXTURES_DIR, 'sample.xlsx'));

    // Both sheets, each under its header, tab-separated cells, numbers stringified,
    // and no line for the empty row of Sheet1.
    assert.strictEqual(
      result.text,
      '--- Sheet: Sheet1 ---\nName\tScore\nalice\t42\nbob\t17\n--- Sheet: Totals ---\nTotal\t59',
    );
    assert.strictEqual(result.truncated, false);
    assert.strictEqual(result.pages, undefined);
  });

  it('truncates output when it exceeds maxBytes', async () => {
    const result = await extractor.extract(path.join(FIXTURES_DIR, 'sample.xlsx'), { maxBytes: 8 });

    assert.strictEqual(result.truncated, true);
    assert.ok(Buffer.byteLength(result.text, 'utf-8') <= 8);
  });

  it('throws GOTextExtractionError on a malformed XLSX', async (t) => {
    const file = await writeTempFile(t, 'bad.xlsx', 'not an xlsx');

    await assert.rejects(
      extractor.extract(file),
      (err) => err instanceof GOTextExtractionError && /Failed to parse XLSX/.test(err.message),
    );
  });
});
