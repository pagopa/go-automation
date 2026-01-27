/**
 * File Service - Handles file I/O operations
 */

import * as fs from 'fs/promises';

import type { SEND } from '@go-automation/go-common';

/**
 * Reads IUN lines from a text file
 *
 * Each line should contain either:
 * - A simple IUN
 * - An IUN with date filter (format: IUN|DATE)
 * - A filename containing IUN (format: IUN_xxx.RECINDEX_yyy)
 *
 * @param filePath - Absolute path to the input file
 * @returns Array of raw lines from the file
 * @throws Error if the file cannot be read
 *
 * @example
 * ```typescript
 * const lines = await readIunFile('/path/to/iuns.txt');
 * // ['IUN1', 'IUN2|2024-01-15', 'IUN3']
 * ```
 */
export async function readIunFile(filePath: string): Promise<ReadonlyArray<string>> {
  const content = await fs.readFile(filePath, 'utf-8');
  return content.split('\n');
}

/**
 * Writes timeline results to a JSON file
 *
 * @param filePath - Absolute path to the output file
 * @param results - Array of timeline results to write
 * @throws Error if the file cannot be written
 *
 * @example
 * ```typescript
 * await writeResultsFile('/path/to/output.json', results);
 * ```
 */
export async function writeResultsFile(
  filePath: string,
  results: ReadonlyArray<SEND.SENDTimelineResult>,
): Promise<void> {
  const content = JSON.stringify(results, null, 4);
  await fs.writeFile(filePath, content, 'utf-8');
}
