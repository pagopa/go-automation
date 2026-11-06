import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { GOBinaryFileExporter, GOTextFileImporter } from '@go-automation/go-common/core';

/**
 * Creates a fresh, private directory under the OS temp dir with `mkdtemp`
 * (unique name, mode 0700), so no other user can pre-create or read it.
 *
 * @param prefix - Readable prefix
 * @returns Absolute path of the created directory
 */
export async function tempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
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
