import { randomUUID } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';

import { GOBinaryFileExporter, GOTextFileImporter } from '@go-automation/go-common/core';

/**
 * Creates a fresh directory path under the OS temp dir (created on first write).
 *
 * @param prefix - Readable prefix
 * @returns Absolute directory path
 */
export function tempDir(prefix: string): string {
  return path.join(os.tmpdir(), `${prefix}-${randomUUID()}`);
}

/**
 * Writes a text or binary fixture with the go-common exporter (creates parents).
 *
 * @param filePath - Absolute path
 * @param content - Content
 */
export async function writeFixture(filePath: string, content: string | Buffer): Promise<void> {
  await new GOBinaryFileExporter({ outputPath: filePath }).export(
    typeof content === 'string' ? Buffer.from(content, 'utf8') : content,
  );
}

/**
 * Reads a text file with the go-common importer.
 *
 * @param filePath - Absolute path
 * @returns Content, or `undefined` when the file does not exist
 */
export async function readFixture(filePath: string): Promise<string | undefined> {
  return new GOTextFileImporter({ inputPath: filePath, optional: true }).import();
}
