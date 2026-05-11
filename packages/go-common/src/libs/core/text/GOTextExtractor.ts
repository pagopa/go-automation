import type { GOTextExtractionOptions } from './GOTextExtractionOptions.js';
import type { GOTextExtractionResult } from './GOTextExtractionResult.js';

/**
 * Extractor capable of converting one or more file types into plain text.
 *
 * Implementations declare:
 *  - `supportedMimeTypes`: canonical IANA MIME types they handle;
 *  - `supportedExtensions`: lowercase extensions (with leading dot, e.g. '.pdf')
 *    used as a fallback when the upstream MIME is `application/octet-stream`
 *    or unreliable (a common scenario with Jira attachments).
 */
export interface GOTextExtractor {
  readonly supportedMimeTypes: ReadonlySet<string>;
  readonly supportedExtensions: ReadonlySet<string>;
  extract(filePath: string, options?: GOTextExtractionOptions): Promise<GOTextExtractionResult>;
}
