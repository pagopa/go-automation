/**
 * Binary File Importer - Reads a file as raw bytes (Buffer).
 *
 * Counterpart of `GOBinaryFileExporter`. Use cases: documents to upload,
 * content hashing, attachments.
 */

import * as fs from 'fs/promises';

import { isEnoentError } from '../../utils/GOTypeGuards.js';
import type { GOFileImporter } from '../GOFileImporter.js';
import type { GOBinaryFileImporterOptions } from './GOBinaryFileImporterOptions.js';
import { GOFileTooLargeError } from './GOFileTooLargeError.js';

/**
 * Reads a binary file from disk.
 *
 * @example
 * ```typescript
 * const pdf = await new GOBinaryFileImporter({ inputPath, maxBytes: 200 * 1024 * 1024 }).import();
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
}
