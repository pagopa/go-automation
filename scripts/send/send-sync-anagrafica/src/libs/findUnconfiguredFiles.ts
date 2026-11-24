/**
 * Finds table files the map names nowhere.
 *
 * The mirror of `missing-file`, and the more interesting direction: a file
 * nobody configured is a table somebody expects to be loaded and that no tool
 * will ever load. `pn-helpdesk-roles` was exactly that until the reference
 * added it, and it sat unconfigured in the meantime.
 *
 * Reported, never resolved by decoding the file name into a table name: the
 * map is the only thing that says which account owns a table and what its key
 * schema is, and neither is guessable from a path.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { RepositoryLayout } from './loadRepositoryItems.js';

/** Extension a table file carries. */
const TABLE_FILE_EXTENSION = '.json';

/** A file found on disk that the table map does not declare. */
export interface UnconfiguredFile {
  /** Account directory it was found in. */
  readonly account: string;

  /** Full path. */
  readonly source: string;

  /** File name without its extension, which is what a table would be called. */
  readonly name: string;
}

/**
 * Lists the table files of one account that the map does not declare.
 *
 * @param layout - Repository layout
 * @param accounts - Account directories to look in
 * @param declared - Table names the map declares
 * @returns One entry per undeclared file
 */
export async function findUnconfiguredFiles(
  layout: RepositoryLayout,
  accounts: ReadonlyArray<string>,
  declared: ReadonlyArray<string>,
): Promise<ReadonlyArray<UnconfiguredFile>> {
  const found: UnconfiguredFile[] = [];

  for (const account of accounts) {
    const directory = path.join(layout.configPath, layout.env, layout.confDir, account, layout.dynamodbDir);

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- percorso costruito dal checkout che l'operatore ha indicato con --config-path.
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(TABLE_FILE_EXTENSION)) continue;

      const name = entry.name.slice(0, -TABLE_FILE_EXTENSION.length);
      if (declared.includes(name)) continue;

      found.push({ account, source: path.join(directory, entry.name), name });
    }
  }

  return found;
}
