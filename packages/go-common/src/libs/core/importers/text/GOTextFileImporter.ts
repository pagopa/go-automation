/**
 * Text File Importer - Reads a single plain text file and returns its content as a string
 *
 * Unlike GOFileListImporter (which reads line by line as a collection),
 * this importer reads the entire file content as a single string value.
 *
 * Use cases: prompt templates, raw text input, configuration snippets.
 */

import * as fs from 'fs/promises';

import type { GOFileImporter } from '../GOFileImporter.js';
import type { GOTextFileImporterOptions } from './GOTextFileImporterOptions.js';

/**
 * Imports a single text file and returns its content as a string.
 *
 * @example
 * ```typescript
 * const importer = new GOTextFileImporter({ inputPath: '/tmp/prompt.txt' });
 * const content = await importer.import();
 * console.log(content);
 * ```
 *
 * @example
 * ```typescript
 * // Optional file — returns undefined if missing
 * const importer = new GOTextFileImporter({ inputPath: './input.txt', optional: true });
 * const content = await importer.import(); // string | undefined
 * ```
 */
export class GOTextFileImporter implements GOFileImporter<string | undefined> {
  constructor(private readonly options: GOTextFileImporterOptions) {}

  /**
   * Reads the text file at the configured input path.
   *
   * @returns The file content as a string, or undefined if the file does not exist and optional is true
   * @throws If the file does not exist (when optional is false) or cannot be read
   */
  async import(): Promise<string | undefined> {
    const { inputPath, encoding = 'utf-8' } = this.options;

    try {
      return await fs.readFile(inputPath, encoding);
    } catch (error: unknown) {
      if (this.options.optional && isFileNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }
}

/**
 * Type guard for ENOENT file-not-found errors
 */
function isFileNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
