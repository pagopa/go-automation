import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import ExcelJS from 'exceljs';

import { GOXlsxTextExtractor } from '../GOXlsxTextExtractor.js';
import { GOTextExtractionError } from '../../GOTextExtractionError.js';

async function makeXlsx(filePath: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(['Name', 'Score']);
  sheet.addRow(['alice', 42]);
  sheet.addRow(['bob', 17]);
  await workbook.xlsx.writeFile(filePath);
}

describe('GOXlsxTextExtractor', () => {
  const extractor = new GOXlsxTextExtractor();

  it('declares XLSX MIME and .xlsx extension', () => {
    assert.ok(extractor.supportedMimeTypes.has('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
    assert.ok(extractor.supportedExtensions.has('.xlsx'));
  });

  it('extracts text from a multi-row workbook', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-xlsx-extractor-'));
    const file = path.join(dir, 'data.xlsx');
    try {
      await makeXlsx(file);
      const result = await extractor.extract(file);
      assert.match(result.text, /--- Sheet: Sheet1 ---/);
      assert.match(result.text, /Name/);
      assert.match(result.text, /alice/);
      assert.match(result.text, /42/);
      assert.strictEqual(result.truncated, false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
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
