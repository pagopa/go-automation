import { createHash } from 'node:crypto';

import { GOJSONFileExporter } from '@pagopa/go-common/exporters';
import { GOBinaryFileImporter, GOJSONFileImporter } from '@pagopa/go-common/importers';

import type { RunInfo } from './RunInfo.js';

/**
 * File names of a session, inside its GOPaths execution directory (§11.1).
 */
export const RUN_FILES = {
  info: 'run.json',
  journal: 'journal.jsonl',
} as const;

/**
 * Hex SHA-256 of a file, read in chunks: memory never holds the whole input.
 *
 * @param filePath - File to hash
 * @returns Hex digest
 */
export async function hashFileHex(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of new GOBinaryFileImporter({ inputPath: filePath }).importStream()) hash.update(chunk);
  return hash.digest('hex');
}

/**
 * Writes `run.json`.
 *
 * @param filePath - Path from GOPaths
 * @param info - Run information, without secrets
 */
export async function writeRunInfo(filePath: string, info: RunInfo): Promise<void> {
  await new GOJSONFileExporter({ outputPath: filePath, pretty: true }).export(info);
}

/**
 * Reads `run.json` of a previous session.
 *
 * @param filePath - Path of the file
 * @returns Run information
 * @throws Error when the file does not exist
 */
export async function readRunInfo(filePath: string): Promise<RunInfo> {
  const info = await new GOJSONFileImporter<RunInfo>({ inputPath: filePath }).import();
  if (info === undefined) throw new Error(`${filePath}: empty run information`);
  return info;
}
