/**
 * Reads the items one table's configuration file declares.
 *
 * The files are NDJSON, one item per line, and each line is **already in
 * DynamoDB wire form** (`{"cap":{"S":"83030"}}`). They are read as text and
 * parsed line by line rather than unmarshalled: the comparison happens in that
 * same form, so nothing is converted and nothing can be lost converting it.
 *
 * Path resolution follows the reference: the environment's own file first, a
 * shared one second. No such shared directory exists in pn-configuration
 * today, but the contract is the reference's and a file appearing there would
 * otherwise be silently ignored.
 */

import { GOTextFileImporter } from '@pagopa/go-common/importers';
import * as path from 'node:path';

/** Where a table's declared items came from, and what they are. */
export interface RepositoryTable {
  /** Path the items were read from. */
  readonly source: string;

  /** One item per non-empty line, in wire form. */
  readonly items: ReadonlyArray<Record<string, unknown>>;
}

/** Options naming the layout of the configuration repository. */
export interface RepositoryLayout {
  /** Local checkout of pn-configuration. */
  readonly configPath: string;

  /** Environment directory. */
  readonly env: string;

  /** Per-account configuration directory inside an environment. */
  readonly confDir: string;

  /** Table-file directory inside an account. */
  readonly dynamodbDir: string;
}

/** The two paths a table's file may live at, most specific first. */
export function candidatePaths(layout: RepositoryLayout, account: string, table: string): ReadonlyArray<string> {
  const file = `${table}.json`;
  return [
    path.join(layout.configPath, layout.env, layout.confDir, account, layout.dynamodbDir, file),
    path.join(layout.configPath, layout.confDir, account, layout.dynamodbDir, file),
  ];
}

/**
 * Reads one table's declared items.
 *
 * @param layout - Repository layout
 * @param account - Account owning the table
 * @param table - Table name
 * @returns The items and the path they came from, or undefined when no file exists
 * @throws Error when a line is not valid JSON, naming the line
 */
export async function loadRepositoryItems(
  layout: RepositoryLayout,
  account: string,
  table: string,
): Promise<RepositoryTable | undefined> {
  for (const candidate of candidatePaths(layout, account, table)) {
    const text = await new GOTextFileImporter({ inputPath: candidate, optional: true }).import();
    if (text === undefined) continue;

    return { source: candidate, items: parseItems(text, candidate) };
  }
  return undefined;
}

/**
 * Parses the NDJSON body of a table file.
 *
 * @param text - File content
 * @param source - Path, used in the error message
 * @returns One item per non-empty line
 * @throws Error naming the first line that is not valid JSON
 */
export function parseItems(text: string, source: string): ReadonlyArray<Record<string, unknown>> {
  const items: Record<string, unknown>[] = [];

  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '') return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error: unknown) {
      throw new Error(`${source}:${String(index + 1)} is not valid JSON: ${(error as Error).message}`, {
        cause: error,
      });
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${source}:${String(index + 1)} is not a JSON object`);
    }
    items.push(parsed as Record<string, unknown>);
  });

  return items;
}
