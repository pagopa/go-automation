import { parse } from 'yaml';

import { PUBLISHED_SCOPE } from './releaseConstants.js';
import type { CatalogTable } from './types/CatalogTable.js';
import type { GitPort } from './types/GitPort.js';

/** Dependency fields that reach the consumers of a published package. */
const RUNTIME_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];

function asRanges(value: unknown): ReadonlyMap<string, string> {
  if (typeof value !== 'object' || value === null) return new Map();
  return new Map(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

/**
 * The pnpm catalogs at a commit, read from `pnpm-workspace.yaml` with a YAML parser.
 *
 * @param git - Git access
 * @param commit - Commit to read
 * @returns Catalog name (`default` for `catalog:`) → package → range
 */
export function readCatalogs(git: GitPort, commit: string): CatalogTable {
  const text = git.showFile(commit, 'pnpm-workspace.yaml');
  const workspace: unknown = text === undefined ? undefined : parse(text);
  const table = new Map<string, ReadonlyMap<string, string>>();
  if (typeof workspace !== 'object' || workspace === null) return table;
  const record = workspace as Readonly<Record<string, unknown>>;
  table.set('default', asRanges(record['catalog']));
  const named = record['catalogs'];
  if (typeof named === 'object' && named !== null) {
    for (const [name, ranges] of Object.entries(named)) table.set(name, asRanges(ranges));
  }
  return table;
}

/**
 * The dependency ranges a consumer of a published package actually gets: runtime, peer and optional
 * dependencies, with `catalog:` and `catalog:<name>` resolved through the catalogs (that is what
 * `pnpm pack` writes into the published manifest). Internal `@pagopa/*` ranges are left out: a change
 * of an internal package is a change of that package. Two packages whose result differs between two
 * commits ship different dependencies, even if their `package.json` did not change.
 *
 * @param manifest - Parsed `package.json`
 * @param catalogs - Catalogs of the same commit
 * @returns A canonical text of the effective ranges, for comparison
 */
export function effectiveDependencies(manifest: Readonly<Record<string, unknown>>, catalogs: CatalogTable): string {
  const resolved: string[] = [];
  for (const field of RUNTIME_FIELDS) {
    for (const [name, range] of asRanges(manifest[field])) {
      if (name.startsWith(PUBLISHED_SCOPE)) continue;
      let effective = range;
      if (range === 'catalog:' || range.startsWith('catalog:')) {
        const catalog = range === 'catalog:' ? 'default' : range.slice('catalog:'.length);
        effective = catalogs.get(catalog)?.get(name) ?? `${range} (missing from the catalog)`;
      }
      resolved.push(`${field}:${name}@${effective}`);
    }
  }
  resolved.sort();
  return resolved.join('\n');
}
