/**
 * PK File Reader - Handles reading partition keys from text files
 */

import * as fs from 'fs/promises';

/**
 * Reads partition key values from a text file
 *
 * Each line should contain a single PK value. Empty lines and
 * leading/trailing whitespace are stripped. Carriage returns are removed.
 * Complexity: O(N) where N is the number of lines
 *
 * @param filePath - Absolute path to the input text file
 * @returns Array of non-empty PK strings
 *
 * @example
 * ```typescript
 * const pks = await readPkFile('/path/to/pks.txt');
 * // ['PK-001', 'PK-002', 'PK-003']
 * ```
 */
export async function readPkFile(filePath: string): Promise<ReadonlyArray<string>> {
  const content = await fs.readFile(filePath, 'utf-8');
  return content
    .split('\n')
    .map((line) => line.replace(/\r/g, '').trim())
    .filter((line) => line !== '');
}
