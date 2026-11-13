import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { PublishedPackage } from './types/PublishedPackage.js';

/** Scope of the packages published to GitHub Packages (EVO-PKGPUB). */
const PUBLISHED_SCOPE = '@pagopa/';

/**
 * Lists the published workspace packages: `packages/*` named `@pagopa/*` and not private.
 *
 * @param repositoryRoot - Monorepo root
 * @returns The published packages, ordered by name
 */
export async function listPublishedPackages(repositoryRoot: string): Promise<ReadonlyArray<PublishedPackage>> {
  const packagesRoot = path.join(repositoryRoot, 'packages');
  const published: PublishedPackage[] = [];
  for (const entry of await fs.readdir(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(packagesRoot, entry.name);
    const manifest = await readManifest(path.join(directory, 'package.json'));
    if (manifest === undefined) continue;
    const { name, private: isPrivate } = manifest;
    if (typeof name === 'string' && name.startsWith(PUBLISHED_SCOPE) && isPrivate !== true) {
      published.push({ name, directory });
    }
  }
  return published.sort((left, right) => left.name.localeCompare(right.name));
}

async function readManifest(file: string): Promise<Readonly<Record<string, unknown>> | undefined> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Readonly<Record<string, unknown>>) : undefined;
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}
