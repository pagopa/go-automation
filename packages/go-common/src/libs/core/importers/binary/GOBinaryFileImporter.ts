/**
 * Binary File Importer - Reads a file as raw bytes (Buffer).
 *
 * Counterpart of `GOBinaryFileExporter`. Use cases: documents to upload,
 * content hashing, attachments.
 */

import type { ReadStream } from 'fs';
import * as fs from 'fs/promises';

import { isEnoentError } from '../../utils/GOTypeGuards.js';
import type { GOFileImporter } from '../GOFileImporter.js';
import type { GOBinaryFileImporterOptions } from './GOBinaryFileImporterOptions.js';
import { GOFileTooLargeError } from './GOFileTooLargeError.js';

/**
 * Reads a binary file from disk: whole (`import()`) or in chunks
 * (`importStream()`, constant memory, like the `importStream()` of the list
 * importers).
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
   * @throws GOFileTooLargeError when the file exceeds `maxBytes`; any read error otherwise
   */
  async import(): Promise<Buffer | undefined> {
    const { inputPath, maxBytes } = this.options;
    try {
      if (maxBytes !== undefined) {
        const { size } = await fs.stat(inputPath);
        if (size > maxBytes) throw new GOFileTooLargeError(inputPath, size, maxBytes);
      }
      return await fs.readFile(inputPath);
    } catch (error: unknown) {
      if (this.options.optional === true && isEnoentError(error)) return undefined;
      throw error;
    }
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
   * @throws GOFileTooLargeError when the file exceeds `maxBytes`; any read error otherwise
   */
  async *importStream(): AsyncGenerator<Buffer, void, unknown> {
    const { inputPath, maxBytes } = this.options;
    let stream: ReadStream;
    try {
      if (maxBytes !== undefined) {
        const { size } = await fs.stat(inputPath);
        if (size > maxBytes) throw new GOFileTooLargeError(inputPath, size, maxBytes);
      }
      const handle = await fs.open(inputPath, 'r');
      stream = handle.createReadStream(); // autoClose: the stream closes the handle
    } catch (error: unknown) {
      if (this.options.optional === true && isEnoentError(error)) return;
      throw error;
    }
    // Type assertion: a stream without encoding yields Buffer chunks
    for await (const chunk of stream as AsyncIterable<Buffer>) yield chunk;
  }
}
