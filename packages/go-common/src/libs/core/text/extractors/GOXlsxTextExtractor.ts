/**
 * XLSX text extractor backed by `read-excel-file`.
 *
 * Concatenates every sheet and every cell as tab-separated rows, prefixed by
 * a `--- Sheet: <name> ---` header. Empty rows are dropped to keep the index
 * compact.
 */
import readXlsxFile from 'read-excel-file/node';

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

type XlsxCell = string | number | boolean | Date | null;

export class GOXlsxTextExtractor implements GOTextExtractor {
  public readonly supportedMimeTypes: ReadonlySet<string> = SUPPORTED_MIME_TYPES;
  public readonly supportedExtensions: ReadonlySet<string> = SUPPORTED_EXTENSIONS;

  public async extract(filePath: string, options?: GOTextExtractionOptions): Promise<GOTextExtractionResult> {
    const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
    try {
      const sheetInfos = await readXlsxFile(filePath, { getSheets: true });

      const lines: string[] = [];
      for (const sheetInfo of sheetInfos) {
        const rows = (await readXlsxFile(filePath, { sheet: sheetInfo.name })) as XlsxCell[][];
        lines.push(`--- Sheet: ${sheetInfo.name} ---`);
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

function formatCell(value: XlsxCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return '';
}
