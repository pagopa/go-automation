/**
 * DOCX text extractor backed by `mammoth`.
 *
 * Uses `extractRawText` to produce plain text without HTML markup. Embedded
 * images are silently dropped.
 */
import { GOTextExtractionError } from '../GOTextExtractionError.js';
import type { GOTextExtractionOptions } from '../GOTextExtractionOptions.js';
import type { GOTextExtractionResult } from '../GOTextExtractionResult.js';
import type { GOTextExtractor } from '../GOTextExtractor.js';

import { truncateText } from './truncateText.js';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

const SUPPORTED_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set(['.docx']);

export class GODocxTextExtractor implements GOTextExtractor {
  public readonly supportedMimeTypes: ReadonlySet<string> = SUPPORTED_MIME_TYPES;
  public readonly supportedExtensions: ReadonlySet<string> = SUPPORTED_EXTENSIONS;

  public async extract(filePath: string, options?: GOTextExtractionOptions): Promise<GOTextExtractionResult> {
    const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      const { text, truncated } = truncateText(result.value, maxBytes);
      return { text, pages: undefined, truncated };
    } catch (error) {
      throw new GOTextExtractionError(
        `Failed to parse DOCX: ${filePath}`,
        filePath,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        error,
      );
    }
  }
}
