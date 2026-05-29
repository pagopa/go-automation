/**
 * XLSX text extractor backed by `read-excel-file`.
 *
 * Concatenates every sheet and every cell as tab-separated rows, prefixed by
 * a `--- Sheet: <name> ---` header. Empty rows are dropped to keep the index
 * compact.
 */
import readXlsxFile, { readSheetNames } from 'read-excel-file/node';
import type { CellValue, Row } from 'read-excel-file/node';

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
      const sheetNames = await readSheetNames(filePath);

      const lines: string[] = [];
      for (const sheetName of sheetNames) {
        const rows: Row[] = await readXlsxFile(filePath, { sheet: sheetName });
        lines.push(`--- Sheet: ${sheetName} ---`);
        for (const row of rows) {
          const cells = row.map(formatCell);
          if (cells.some((cellText) => cellText.length > 0)) {
            lines.push(cells.join('\t'));
          }
        }
      }

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

// `CellValue` from read-excel-file is typed as `string | number | boolean | typeof Date` —
// a library type quirk: at runtime cells are Date instances, but the type says `DateConstructor`.
// `instanceof Date` is the correct runtime check; the cast inside isolates the workaround.
function formatCell(value: CellValue | null): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return (value as Date).toISOString();
  return '';
}
