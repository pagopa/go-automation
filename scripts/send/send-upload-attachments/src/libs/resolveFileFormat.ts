/**
 * File format resolution helpers
 */

import * as path from 'path';

import { isUploadFileFormat, UPLOAD_FILE_FORMATS } from '../types/index.js';
import type { UploadFileFormat } from '../types/index.js';

/**
 * Parses a format string into a supported file format
 *
 * @param value - Format value (e.g. from the output.format parameter)
 * @returns The validated file format
 * @throws Error when the format is not supported
 */
export function parseUploadFileFormat(value: string): UploadFileFormat {
  const normalized = value.trim().toLowerCase();
  if (!isUploadFileFormat(normalized)) {
    throw new Error(`Unsupported format '${value}': supported formats are ${UPLOAD_FILE_FORMATS.join(', ')}`);
  }
  return normalized;
}

/**
 * Resolves the file format from a file extension
 *
 * @param filePath - Path of the file to inspect
 * @returns The file format inferred from the extension
 * @throws Error when the extension is not a supported format
 */
export function resolveFileFormat(filePath: string): UploadFileFormat {
  const extension = path.extname(filePath).toLowerCase().replace('.', '');
  if (!isUploadFileFormat(extension)) {
    throw new Error(
      `Unsupported file format '.${extension}' for '${filePath}': supported formats are ${UPLOAD_FILE_FORMATS.join(', ')}`,
    );
  }
  return extension;
}

/**
 * Builds the default output file name from the input file name
 *
 * @param inputFile - Input file path as provided by the user
 * @param outputFormat - Output file format
 * @returns File name in the form `<inputBasename>-results.<format>`
 *
 * @example
 * ```typescript
 * buildDefaultOutputFileName('data/files.csv', 'csv'); // 'files-results.csv'
 * ```
 */
export function buildDefaultOutputFileName(inputFile: string, outputFormat: UploadFileFormat): string {
  const baseName = path.basename(inputFile, path.extname(inputFile));
  return `${baseName}-results.${outputFormat}`;
}
