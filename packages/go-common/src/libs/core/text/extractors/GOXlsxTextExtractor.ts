/**
 * XLSX text extractor backed by `exceljs`.
 *
 * Concatenates every sheet and every cell as tab-separated rows, prefixed by
 * a `--- Sheet: <name> ---` header. Empty rows are dropped to keep the index
 * compact.
 */
import ExcelJS from 'exceljs';

import { GOTextExtractionError } from '../GOTextExtractionError.js';
import type { GOTextExtractionOptions } from '../GOTextExtractionOptions.js';
import type { GOTextExtractionResult } from '../GOTextExtractionResult.js';
import type { GOTextExtractor } from '../GOTextExtractor.js';

import { truncateText } from './truncateText.js';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

const SUPPORTED_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set(['.xlsx']);

export class GOXlsxTextExtractor implements GOTextExtractor {
  public readonly supportedMimeTypes: ReadonlySet<string> = SUPPORTED_MIME_TYPES;
  public readonly supportedExtensions: ReadonlySet<string> = SUPPORTED_EXTENSIONS;

  public async extract(filePath: string, options?: GOTextExtractionOptions): Promise<GOTextExtractionResult> {
    const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      const lines: string[] = [];
      workbook.eachSheet((sheet) => {
        lines.push(`--- Sheet: ${sheet.name} ---`);
        sheet.eachRow({ includeEmpty: false }, (row) => {
          const cells: string[] = [];
          row.eachCell({ includeEmpty: false }, (cell) => {
            cells.push(formatCell(cell.value));
          });
          if (cells.some((cellText) => cellText.length > 0)) {
            lines.push(cells.join('\t'));
          }
        });
      });

      const merged = lines.join('\n');
      const { text, truncated } = truncateText(merged, maxBytes);
      return { text, pages: undefined, truncated };
    } catch (error) {
      throw new GOTextExtractionError(
        `Failed to parse XLSX: ${filePath}`,
        filePath,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        error,
      );
    }
  }
}

function formatCell(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return '';

  if (isRichTextValue(value)) {
    return value.richText.map((segment: ExcelJS.RichText) => segment.text).join('');
  }
  if (isHyperlinkValue(value)) {
    return value.text;
  }
  if (isFormulaValue(value)) {
    return formatCell(value.result ?? null);
  }
  if (isErrorValue(value)) {
    return value.error;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function isRichTextValue(value: object): value is ExcelJS.CellRichTextValue {
  return Array.isArray((value as ExcelJS.CellRichTextValue).richText);
}

function isHyperlinkValue(value: object): value is ExcelJS.CellHyperlinkValue {
  const candidate = value as ExcelJS.CellHyperlinkValue;
  return typeof candidate.text === 'string' && typeof candidate.hyperlink === 'string';
}

function isFormulaValue(value: object): value is ExcelJS.CellFormulaValue {
  const candidate = value as ExcelJS.CellFormulaValue;
  return typeof candidate.formula === 'string';
}

function isErrorValue(value: object): value is ExcelJS.CellErrorValue {
  return typeof (value as ExcelJS.CellErrorValue).error === 'string';
}
