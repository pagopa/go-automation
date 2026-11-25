import { createHash } from 'node:crypto';
import * as path from 'node:path';

import { GOBinaryFileImporter, GOFileTooLargeError, GOPathOutsideRootError } from '@pagopa/go-common/importers';
import { isEnoentError } from '@pagopa/go-common/utils';

import type { DocumentInspection } from './DocumentInspection.js';

/** Maximum PDF size accepted by SEND (`FILE_PDF_TOOBIG_ERROR`, A14). */
export const MAX_DOCUMENT_BYTES: number = 200 * 1024 * 1024;

const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');

/**
 * Checks local documents before any upload or send (§8.1.1), with a cache by
 * path so a file shared by many rows is read once.
 *
 * Notification documents must be PDF (`contentType` is `^application/pdf$`
 * in `NotificationDocument` v2.6). Files are streamed with
 * `GOBinaryFileImporter.importStream`, which refuses a file above 200 MB
 * before reading it: hash, size and header check use O(chunk) memory, so
 * many rows inspected in parallel never hold whole PDFs.
 *
 * Row files come from the input, so they are confined to the documents
 * directory on their real path (symlinks resolved): the mapping already
 * rejects `../` and absolute paths outside it, this also stops a symlink
 * inside the directory that points elsewhere. The shared document comes from
 * the operator (CLI or environments file) and is not confined.
 */
export class LocalDocumentInspector {
  private readonly cache = new Map<string, Promise<DocumentInspection>>();
  private readonly rowFileCache = new Map<string, Promise<DocumentInspection>>();

  /**
   * @param documentsDir - Directory row files must live in
   */
  constructor(private readonly documentsDir: string) {}

  /**
   * Inspects an operator-provided document, e.g. the shared one (cached by absolute path).
   *
   * @param filePath - Absolute path
   * @returns The inspected document, or the reason it cannot be sent
   */
  public async inspect(filePath: string): Promise<DocumentInspection> {
    return this.cached(this.cache, filePath, undefined);
  }

  /**
   * Inspects a file named by an input row, confined to the documents directory
   * (cached by absolute path).
   *
   * @param filePath - Absolute path
   * @returns The inspected document, or the reason it cannot be sent
   *   (`DOCUMENT_OUTSIDE_DIR` when its real path is outside the directory)
   */
  public async inspectRowFile(filePath: string): Promise<DocumentInspection> {
    return this.cached(this.rowFileCache, filePath, this.documentsDir);
  }

  private async cached(
    cache: Map<string, Promise<DocumentInspection>>,
    filePath: string,
    confineTo: string | undefined,
  ): Promise<DocumentInspection> {
    const hit = cache.get(filePath);
    if (hit !== undefined) return hit;
    const inspection = this.inspectUncached(filePath, confineTo);
    cache.set(filePath, inspection);
    return inspection;
  }

  private async inspectUncached(filePath: string, confineTo: string | undefined): Promise<DocumentInspection> {
    if (path.extname(filePath).toLowerCase() !== '.pdf') {
      return failure(filePath, 'UNSUPPORTED_EXTENSION', 'only PDF documents can be attached to a notification');
    }

    const hash = createHash('sha256');
    let size = 0;
    let header = Buffer.alloc(0);
    try {
      const chunks = new GOBinaryFileImporter({
        inputPath: filePath,
        maxBytes: MAX_DOCUMENT_BYTES,
        ...(confineTo !== undefined && { confineTo }),
      }).importStream();
      for await (const chunk of chunks) {
        if (header.length < PDF_MAGIC.length) {
          header = Buffer.concat([header, chunk.subarray(0, PDF_MAGIC.length - header.length)]);
          // Not a PDF: no need to read (and hash) the rest.
          if (header.length === PDF_MAGIC.length && !header.equals(PDF_MAGIC)) break;
        }
        hash.update(chunk);
        size += chunk.length;
      }
    } catch (error: unknown) {
      if (isEnoentError(error)) return failure(filePath, 'FILE_NOT_FOUND', 'file not found');
      if (error instanceof GOPathOutsideRootError) {
        return failure(filePath, 'DOCUMENT_OUTSIDE_DIR', `resolves to ${error.realPath}, outside ${error.root}`);
      }
      if (error instanceof GOFileTooLargeError) {
        return failure(filePath, 'FILE_TOO_BIG', `file is ${error.size} bytes, SEND accepts at most ${error.maxBytes}`);
      }
      const reason = error instanceof Error ? error.message : String(error);
      return failure(filePath, 'FILE_UNREADABLE', `cannot read file: ${reason}`);
    }

    if (header.length === 0) return failure(filePath, 'FILE_EMPTY', 'file is empty');
    if (!header.equals(PDF_MAGIC)) return failure(filePath, 'NOT_A_PDF', 'file does not start with %PDF-');
    return { path: filePath, size, sha256: hash.digest('base64'), contentType: 'application/pdf' };
  }
}

function failure(filePath: string, code: string, message: string): DocumentInspection {
  return { path: filePath, failure: code, message };
}
