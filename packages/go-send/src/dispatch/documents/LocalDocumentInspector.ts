import { createHash } from 'node:crypto';
import * as path from 'node:path';

import { GOBinaryFileImporter, GOFileTooLargeError } from '@go-automation/go-common/core';

import type { DocumentInspection } from './DocumentInspection.js';

/** Maximum PDF size accepted by SEND (`FILE_PDF_TOOBIG_ERROR`, A14). */
export const MAX_DOCUMENT_BYTES: number = 200 * 1024 * 1024;

const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');

/**
 * Checks local documents before any upload or send (§8.1.1), with a cache by
 * path so a file shared by many rows is read once.
 *
 * Notification documents must be PDF (`contentType` is `^application/pdf$`
 * in `NotificationDocument` v2.6). Files are read with
 * `GOBinaryFileImporter`, which refuses a file above 200 MB without loading it.
 */
export class LocalDocumentInspector {
  private readonly cache = new Map<string, Promise<DocumentInspection>>();

  /**
   * Inspects a document (cached by absolute path).
   *
   * @param filePath - Absolute path
   * @returns The inspected document, or the reason it cannot be sent
   */
  public async inspect(filePath: string): Promise<DocumentInspection> {
    const cached = this.cache.get(filePath);
    if (cached !== undefined) return cached;
    const inspection = this.inspectUncached(filePath);
    this.cache.set(filePath, inspection);
    return inspection;
  }

  private async inspectUncached(filePath: string): Promise<DocumentInspection> {
    if (path.extname(filePath).toLowerCase() !== '.pdf') {
      return failure(filePath, 'UNSUPPORTED_EXTENSION', 'only PDF documents can be attached to a notification');
    }

    let content: Buffer | undefined;
    try {
      content = await new GOBinaryFileImporter({
        inputPath: filePath,
        optional: true,
        maxBytes: MAX_DOCUMENT_BYTES,
      }).import();
    } catch (error: unknown) {
      if (error instanceof GOFileTooLargeError) {
        return failure(filePath, 'FILE_TOO_BIG', `file is ${error.size} bytes, SEND accepts at most ${error.maxBytes}`);
      }
      const reason = error instanceof Error ? error.message : String(error);
      return failure(filePath, 'FILE_UNREADABLE', `cannot read file: ${reason}`);
    }

    if (content === undefined) return failure(filePath, 'FILE_NOT_FOUND', 'file not found');
    if (content.length === 0) return failure(filePath, 'FILE_EMPTY', 'file is empty');
    if (!content.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
      return failure(filePath, 'NOT_A_PDF', 'file does not start with %PDF-');
    }
    return {
      path: filePath,
      size: content.length,
      sha256: createHash('sha256').update(content).digest('base64'),
      contentType: 'application/pdf',
    };
  }
}

function failure(filePath: string, code: string, message: string): DocumentInspection {
  return { path: filePath, failure: code, message };
}
