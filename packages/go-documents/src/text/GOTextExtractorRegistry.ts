/**
 * Registry of GOTextExtractor implementations, dispatched by MIME type with a
 * fallback on file extension. Multiple extractors can register for the same
 * MIME / extension; the first registered wins on conflict.
 *
 * @example
 * ```typescript
 * const registry = new GOTextExtractorRegistry();
 * registry.register(new GOPlainTextExtractor());
 * registry.register(new GOPdfTextExtractor());
 *
 * if (registry.canHandle('application/pdf')) {
 *   const result = await registry.extract('application/pdf', '/tmp/file.pdf');
 * }
 * ```
 */
import * as path from 'node:path';

import { GOTextExtractionError } from './GOTextExtractionError.js';
import type { GOTextExtractionOptions } from './GOTextExtractionOptions.js';
import type { GOTextExtractionResult } from './GOTextExtractionResult.js';
import type { GOTextExtractor } from './GOTextExtractor.js';

export class GOTextExtractorRegistry {
  private readonly byMimeType: Map<string, GOTextExtractor> = new Map();
  private readonly byExtension: Map<string, GOTextExtractor> = new Map();

  /**
   * Registers an extractor. MIME types and extensions are matched
   * case-insensitively.
   */
  public register(extractor: GOTextExtractor): void {
    for (const mimeType of extractor.supportedMimeTypes) {
      const key = mimeType.toLowerCase();
      if (!this.byMimeType.has(key)) {
        this.byMimeType.set(key, extractor);
      }
    }
    for (const ext of extractor.supportedExtensions) {
      const key = ext.toLowerCase();
      if (!this.byExtension.has(key)) {
        this.byExtension.set(key, extractor);
      }
    }
  }

  /**
   * Returns true if the registry can handle the given MIME type or filename.
   * Either argument may be omitted (e.g. unknown MIME falls back to extension).
   */
  public canHandle(mimeType?: string, fileName?: string): boolean {
    return this.resolveExtractor(mimeType, fileName) !== undefined;
  }

  /**
   * Extracts text. Throws GOTextExtractionError if no extractor can handle
   * the input, or propagates the underlying extractor's error otherwise.
   */
  public async extract(
    mimeType: string | undefined,
    filePath: string,
    options?: GOTextExtractionOptions,
  ): Promise<GOTextExtractionResult> {
    const extractor = this.resolveExtractor(mimeType, filePath);
    if (extractor === undefined) {
      throw new GOTextExtractionError(
        `No extractor registered for mimeType="${mimeType ?? 'unknown'}" file="${filePath}"`,
        filePath,
        mimeType,
      );
    }
    return extractor.extract(filePath, options);
  }

  /**
   * Returns the list of MIME types currently supported by the registry.
   */
  public getSupportedMimeTypes(): ReadonlyArray<string> {
    return [...this.byMimeType.keys()];
  }

  /**
   * Returns the list of file extensions currently supported by the registry.
   */
  public getSupportedExtensions(): ReadonlyArray<string> {
    return [...this.byExtension.keys()];
  }

  private resolveExtractor(mimeType?: string, fileName?: string): GOTextExtractor | undefined {
    if (mimeType !== undefined) {
      const byMime = this.byMimeType.get(mimeType.toLowerCase());
      if (byMime !== undefined) return byMime;
    }
    if (fileName !== undefined) {
      const ext = path.extname(fileName).toLowerCase();
      if (ext.length > 0) {
        const byExt = this.byExtension.get(ext);
        if (byExt !== undefined) return byExt;
      }
    }
    return undefined;
  }
}
