/**
 * Binary File Importer - Reads a file as raw bytes (Buffer).
 *
 * Counterpart of `GOBinaryFileExporter`. Use cases: documents to upload,
 * content hashing, attachments.
 */

import type { FileHandle } from 'fs/promises';
import * as fs from 'fs/promises';
import * as path from 'path';

import { isEnoentError } from '../../utils/GOTypeGuards.js';
import type { GOFileImporter } from '../GOFileImporter.js';
import type { GOBinaryFileImporterOptions } from './GOBinaryFileImporterOptions.js';
import { GOFileTooLargeError } from './GOFileTooLargeError.js';
import { GOPathOutsideRootError } from './GOPathOutsideRootError.js';

/**
 * Reads a binary file from disk: whole (`import()`) or in chunks
 * (`importStream()`, constant memory, like the `importStream()` of the list
 * importers).
 *
 * With `maxBytes` the file is opened first and its size checked on the open
 * handle, so a file swapped after the check is not read; the bytes actually
 * read are counted too, so a file that grows while it is read still stops
 * at the limit. With `confineTo` the real path of the file (symlinks
 * resolved) must be inside that directory.
 *
 * @example
 * ```typescript
 * const pdf = await new GOBinaryFileImporter({ inputPath, maxBytes: 200 * 1024 * 1024 }).import();
 *
 * const hash = createHash('sha256');
 * for await (const chunk of new GOBinaryFileImporter({ inputPath }).importStream()) hash.update(chunk);
 * ```
 */
export class GOBinaryFileImporter implements GOFileImporter<Buffer | undefined> {
  constructor(private readonly options: GOBinaryFileImporterOptions) {}

  /**
   * Reads the file at the configured input path.
   *
   * @returns The content, or `undefined` if the file does not exist and `optional` is true
   * @throws GOFileTooLargeError when the file exceeds `maxBytes` (before reading it, or as
   *   soon as the bytes read cross the limit if it grows meanwhile); GOPathOutsideRootError
   *   when it resolves outside `confineTo`; any read error otherwise
   */
  async import(): Promise<Buffer | undefined> {
    const handle = await this.openChecked();
    if (handle === undefined) return undefined;

    if (this.options.maxBytes === undefined) {
      try {
        return await handle.readFile();
      } finally {
        await handle.close();
      }
    }

    const chunks: Buffer[] = [];
    for await (const chunk of this.readChunks(handle)) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  /**
   * Reads the file at the configured input path in chunks, so memory never
   * holds the whole file (hashing or copying large files).
   *
   * The file is opened before the first chunk: a missing file surfaces at the
   * first iteration, never after some chunks were yielded. Stopping the
   * iteration early (`break`, `return`, an error) closes the file.
   *
   * @returns AsyncGenerator yielding the content in order; nothing when the
   *   file does not exist and `optional` is true
   * @throws GOFileTooLargeError when the file exceeds `maxBytes`: before the first
   *   chunk, or as soon as the bytes read cross the limit if the file grows while
   *   it is read (chunks already yielded stay yielded); GOPathOutsideRootError when it
   *   resolves outside `confineTo`; any read error otherwise
   */
  async *importStream(): AsyncGenerator<Buffer, void, unknown> {
    const handle = await this.openChecked();
    if (handle === undefined) return;
    yield* this.readChunks(handle);
  }

  /**
   * Opens the input file and, with `maxBytes`, checks its size on the open
   * handle (closing it when the file is too large). With `confineTo` the real
   * path is checked first.
   *
   * @returns The open handle, or `undefined` when the file does not exist and `optional` is true
   */
  private async openChecked(): Promise<FileHandle | undefined> {
    const { inputPath, maxBytes, confineTo } = this.options;
    let handle: FileHandle;
    try {
      if (confineTo !== undefined) await assertInside(inputPath, confineTo);
      handle = await fs.open(inputPath, 'r');
    } catch (error: unknown) {
      if (this.options.optional === true && isEnoentError(error)) return undefined;
      throw error;
    }
    if (maxBytes === undefined) return handle;

    try {
      const { size } = await handle.stat();
      if (size > maxBytes) throw new GOFileTooLargeError(inputPath, size, maxBytes);
      return handle;
    } catch (error: unknown) {
      await handle.close();
      throw error;
    }
  }

  /**
   * Streams the open handle chunk by chunk, counting the bytes against
   * `maxBytes`. The stream owns the handle (`autoClose`): it is closed at the
   * end, on error, and when the consumer stops early.
   */
  private async *readChunks(handle: FileHandle): AsyncGenerator<Buffer, void, unknown> {
    const { inputPath, maxBytes } = this.options;
    const stream = handle.createReadStream();
    let bytesRead = 0;
    // Type assertion: a stream without encoding yields Buffer chunks
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      bytesRead += chunk.length;
      if (maxBytes !== undefined && bytesRead > maxBytes) {
        throw new GOFileTooLargeError(inputPath, bytesRead, maxBytes);
      }
      yield chunk;
    }
  }
}

/**
 * Checks that the real path of a file is inside the real path of a directory.
 *
 * @throws GOPathOutsideRootError when it is not; ENOENT when the file does not exist
 */
async function assertInside(filePath: string, root: string): Promise<void> {
  const realFile = await fs.realpath(filePath);
  const realRoot = await fs.realpath(root);
  const relative = path.relative(realRoot, realFile);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new GOPathOutsideRootError(filePath, realFile, realRoot);
  }
}
