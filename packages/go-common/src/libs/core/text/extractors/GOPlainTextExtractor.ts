/**
 * Plain-text extractor for `text/plain`, `text/markdown`, `text/csv` and
 * other newline-delimited text formats.
 *
 * Strips a leading UTF-8 BOM (EF BB BF) and the UTF-16 BOMs (FE FF / FF FE) by
 * letting Node's decoder handle them when present. Falls back to UTF-8 with
 * lenient handling of invalid sequences.
 */
import * as fs from 'node:fs/promises';

import { GOTextExtractionError } from '../GOTextExtractionError.js';
import type { GOTextExtractionOptions } from '../GOTextExtractionOptions.js';
import type { GOTextExtractionResult } from '../GOTextExtractionResult.js';
import type { GOTextExtractor } from '../GOTextExtractor.js';

import { truncateText } from './truncateText.js';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

const SUPPORTED_MIME_TYPES: ReadonlySet<string> = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'text/tab-separated-values',
  'text/xml',
  'application/xml',
  'application/json',
  'application/ld+json',
  'application/x-ndjson',
  'application/jsonl',
  'image/svg+xml',
]);

const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.tsv',
  '.log',
  '.xml',
  '.json',
  '.jsonl',
  '.ndjson',
  '.svg',
]);

export class GOPlainTextExtractor implements GOTextExtractor {
  public readonly supportedMimeTypes: ReadonlySet<string> = SUPPORTED_MIME_TYPES;
  public readonly supportedExtensions: ReadonlySet<string> = SUPPORTED_EXTENSIONS;

  public async extract(filePath: string, options?: GOTextExtractionOptions): Promise<GOTextExtractionResult> {
    const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch (error) {
      throw new GOTextExtractionError(`Failed to read file: ${filePath}`, filePath, undefined, error);
    }

    const decoded = decodeWithBomDetection(buffer);
    const { text, truncated } = truncateText(decoded, maxBytes);
    return { text, pages: undefined, truncated };
  }
}

function decodeWithBomDetection(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    // utf16be → swap bytes then decode as utf16le
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let i = 2, j = 0; i + 1 < buffer.length; i += 2, j += 2) {
      const a = buffer[i];
      const b = buffer[i + 1];
      swapped[j] = b ?? 0;
      swapped[j + 1] = a ?? 0;
    }
    return swapped.toString('utf16le');
  }
  return buffer.toString('utf8');
}
