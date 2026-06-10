/**
 * Content type inference for SafeStorage attachment uploads
 */

import * as path from 'path';

/**
 * File extensions (lowercase, with leading dot) mapped to the MIME types
 * accepted by the SafeStorage preload endpoint
 */
export const SEND_ATTACHMENT_CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.pdf': 'application/pdf',
  '.json': 'application/json',
};

/**
 * Infers the MIME type of a file from its extension
 * Complexity: O(1) map lookup
 *
 * @param filePath - Path of the file to inspect
 * @returns The inferred MIME type, or undefined when the extension is unknown
 *
 * @example
 * ```typescript
 * inferAttachmentContentType('/docs/atto.pdf'); // 'application/pdf'
 * inferAttachmentContentType('/docs/f24.json'); // 'application/json'
 * inferAttachmentContentType('/docs/notes.txt'); // undefined
 * ```
 */
export function inferAttachmentContentType(filePath: string): string | undefined {
  const extension = path.extname(filePath).toLowerCase();
  return SEND_ATTACHMENT_CONTENT_TYPES[extension];
}
