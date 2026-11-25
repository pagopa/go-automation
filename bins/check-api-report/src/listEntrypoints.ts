import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { PublishedEntrypoint } from './types/PublishedEntrypoint.js';

const PUBLISHED_SCOPE = '@pagopa/';

/**
 * Lists the export subpaths of every published package (`packages/*` named `@pagopa/*`, not
 * private) with their `types` file. `./package.json` is not an API entrypoint.
 *
 * @param repositoryRoot - Monorepo root
 * @returns The entrypoints, ordered by package and subpath
 * @throws Error when an export has no `types` condition
 */
export async function listEntrypoints(repositoryRoot: string): Promise<ReadonlyArray<PublishedEntrypoint>> {
  const packagesRoot = path.join(repositoryRoot, 'packages');
  const entrypoints: PublishedEntrypoint[] = [];
  for (const entry of (await fs.readdir(packagesRoot, { withFileTypes: true })).filter((item) => item.isDirectory())) {
    const packageDirectory = path.join(packagesRoot, entry.name);
    let manifest: Readonly<Record<string, unknown>>;
    try {
      manifest = JSON.parse(await fs.readFile(path.join(packageDirectory, 'package.json'), 'utf8')) as Readonly<
        Record<string, unknown>
      >;
    } catch {
      continue;
    }
    const name = manifest['name'];
    if (typeof name !== 'string' || !name.startsWith(PUBLISHED_SCOPE) || manifest['private'] === true) continue;
    const exportsField = (manifest['exports'] ?? {}) as Readonly<Record<string, unknown>>;
    for (const [subpath, target] of Object.entries(exportsField)) {
      if (subpath === './package.json') continue;
      const types =
        typeof target === 'object' && target !== null
          ? (target as Readonly<Record<string, unknown>>)['types']
          : undefined;
      if (typeof types !== 'string') throw new Error(`${name} ${subpath}: no "types" condition`);
      entrypoints.push({ packageName: name, packageDirectory, subpath, typesFile: path.join(packageDirectory, types) });
    }
  }
  return entrypoints.sort((left, right) =>
    left.packageName === right.packageName
      ? left.subpath.localeCompare(right.subpath)
      : left.packageName.localeCompare(right.packageName),
  );
}

/**
 * File name of the report of a subpath: `index` for `.`, the subpath with `-` otherwise.
 *
 * @param subpath - Export subpath
 * @returns e.g. `index`, `toolkits-common`, `cloudwatch-logs-insights`
 */
export function reportName(subpath: string): string {
  return subpath === '.' ? 'index' : subpath.slice(2).replaceAll('/', '-');
}
