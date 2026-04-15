/**
 * JSON File Importer - Reads and parses a single JSON file
 *
 * Unlike GOJSONListImporter (which reads arrays/JSONL as item collections),
 * this importer reads a single JSON value from a file.
 *
 * Use cases: configuration files, ignore patterns, report snapshots.
 */

import * as fs from 'fs/promises';

import type { GOFileImporter } from '../GOFileImporter.js';
import type { GOJSONFileImporterOptions } from './GOJSONFileImporterOptions.js';

/**
 * Imports a single JSON value from a file
 *
 * @template TData - The expected type of the parsed JSON value
 *
 * @example
 * ```typescript
 * interface Config { ignorePatterns: string[] }
 * const importer = new GOJSONFileImporter<Config>({ inputPath: '/tmp/config.json' });
 * const config = await importer.import();
 * console.log(config.ignorePatterns);
 * ```
 *
 * @example
 * ```typescript
 * // Optional file — returns undefined if missing
 * const importer = new GOJSONFileImporter<Config>({ inputPath: './optional.json', optional: true });
 * const config = await importer.import(); // Config | undefined
 * ```
 */
export class GOJSONFileImporter<TData = unknown> implements GOFileImporter<TData | undefined> {
  constructor(private readonly options: GOJSONFileImporterOptions) {}

  /**
   * Reads and parses the JSON file at the configured input path.
   *
   * @returns The parsed JSON value, or undefined if the file does not exist and optional is true
   * @throws If the file does not exist (when optional is false) or contains invalid JSON
   */
  async import(): Promise<TData | undefined> {
    const { inputPath, encoding = 'utf-8' } = this.options;

    let content: string;
    try {
      content = await fs.readFile(inputPath, encoding);
    } catch (error: unknown) {
      if (this.options.optional && isFileNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }

    return JSON.parse(content) as TData;
  }
}

/**
 * Type guard for ENOENT file-not-found errors
 */
function isFileNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
