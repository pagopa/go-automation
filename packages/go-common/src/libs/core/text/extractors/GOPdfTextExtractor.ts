/**
 * PDF text extractor backed by `unpdf`.
 *
 * `unpdf` is a modern, ESM-first wrapper around Mozilla's pdf.js that ships a
 * serverless-friendly build with no native dependencies, making it a robust
 * pick for cross-platform usage in this monorepo.
 */
import * as fs from 'node:fs/promises';

import { GOTextExtractionError } from '../GOTextExtractionError.js';
import type { GOTextExtractionOptions } from '../GOTextExtractionOptions.js';
import type { GOTextExtractionResult } from '../GOTextExtractionResult.js';
import type { GOTextExtractor } from '../GOTextExtractor.js';

import { truncateText } from './truncateText.js';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

const SUPPORTED_MIME_TYPES: ReadonlySet<string> = new Set(['application/pdf']);
const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set(['.pdf']);

export class GOPdfTextExtractor implements GOTextExtractor {
  public readonly supportedMimeTypes: ReadonlySet<string> = SUPPORTED_MIME_TYPES;
  public readonly supportedExtensions: ReadonlySet<string> = SUPPORTED_EXTENSIONS;

  public async extract(filePath: string, options?: GOTextExtractionOptions): Promise<GOTextExtractionResult> {
    const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch (error) {
      throw new GOTextExtractionError(`Failed to read PDF file: ${filePath}`, filePath, 'application/pdf', error);
    }

    try {
      // Dynamic import keeps unpdf out of the cold-start path of consumers
      // that never extract PDFs.
      const unpdf = (await import('unpdf')) as UnpdfModule;
      const document = await unpdf.getDocumentProxy(new Uint8Array(buffer));
      const result = await unpdf.extractText(document, { mergePages: true });
      const merged: string = typeof result.text === 'string' ? result.text : result.text.join('\n');
      const { text, truncated } = truncateText(merged, maxBytes);
      return {
        text,
        pages: typeof result.totalPages === 'number' ? result.totalPages : undefined,
        truncated,
      };
    } catch (error) {
      throw new GOTextExtractionError(`Failed to parse PDF: ${filePath}`, filePath, 'application/pdf', error);
    }
  }
}

interface UnpdfDocumentProxy {
  readonly numPages: number;
}

interface UnpdfExtractTextResult {
  readonly text: string | ReadonlyArray<string>;
  readonly totalPages?: number;
}

interface UnpdfModule {
  getDocumentProxy(data: Uint8Array): Promise<UnpdfDocumentProxy>;
  extractText(document: UnpdfDocumentProxy, options: { readonly mergePages: boolean }): Promise<UnpdfExtractTextResult>;
}
