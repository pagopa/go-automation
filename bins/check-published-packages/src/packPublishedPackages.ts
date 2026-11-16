import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { PackedPackage } from './types/PackedPackage.js';

const PUBLISHED_SCOPE = '@pagopa/';

/**
 * Packs every published workspace package (`packages/*` named `@pagopa/*`, not private) with
 * `pnpm pack`, which runs `prepack` (clean + build) exactly as a release would.
 *
 * @param repositoryRoot - Monorepo root
 * @param destination - Empty directory that receives the tarballs
 * @returns The packed packages, ordered by name
 */
export async function packPublishedPackages(
  repositoryRoot: string,
  destination: string,
): Promise<ReadonlyArray<PackedPackage>> {
  const packagesRoot = path.join(repositoryRoot, 'packages');
  const packed: PackedPackage[] = [];
  for (const entry of await fs.readdir(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(packagesRoot, entry.name);
    const manifest = await readManifest(path.join(directory, 'package.json'));
    if (manifest === undefined || !isPublished(manifest)) continue;
    const before = new Set(await fs.readdir(destination));
    execFileSync('pnpm', ['pack', '--pack-destination', destination], {
      cwd: directory,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    const created = (await fs.readdir(destination)).filter((name) => name.endsWith('.tgz') && !before.has(name));
    const [tarball] = created;
    if (tarball === undefined || created.length !== 1) {
      throw new Error(`pnpm pack of ${String(manifest['name'])} produced ${String(created.length)} archives`);
    }
    packed.push(describe(manifest, path.join(destination, tarball)));
  }
  return packed.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Reads already packed tarballs (from the CI artifact of the packing job), so the scenario matrix
 * tests exactly the archives built once on the toolchain Node version.
 *
 * @param directory - Directory with the `.tgz` files
 * @returns The packed packages, ordered by name
 */
export async function readPackedPackages(directory: string): Promise<ReadonlyArray<PackedPackage>> {
  const packed: PackedPackage[] = [];
  for (const name of (await fs.readdir(directory)).filter((file) => file.endsWith('.tgz'))) {
    const tarball = path.join(directory, name);
    const manifest = JSON.parse(
      execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], { encoding: 'utf8' }),
    ) as Readonly<Record<string, unknown>>;
    if (isPublished(manifest)) packed.push(describe(manifest, tarball));
  }
  if (packed.length === 0) throw new Error(`No published tarball in ${directory}`);
  return packed.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * The published workspace packages as described by their manifests, without packing (`tarball` is
 * empty): enough to derive the smoke matrix.
 *
 * @param repositoryRoot - Monorepo root
 * @returns The packages, ordered by name
 */
export async function readPublishedManifests(repositoryRoot: string): Promise<ReadonlyArray<PackedPackage>> {
  const packagesRoot = path.join(repositoryRoot, 'packages');
  const described: PackedPackage[] = [];
  for (const entry of await fs.readdir(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = await readManifest(path.join(packagesRoot, entry.name, 'package.json'));
    if (manifest !== undefined && isPublished(manifest)) described.push(describe(manifest, ''));
  }
  return described.sort((left, right) => left.name.localeCompare(right.name));
}

function isPublished(manifest: Readonly<Record<string, unknown>>): boolean {
  const name = manifest['name'];
  return typeof name === 'string' && name.startsWith(PUBLISHED_SCOPE) && manifest['private'] !== true;
}

function describe(manifest: Readonly<Record<string, unknown>>, tarball: string): PackedPackage {
  const exportsField = manifest['exports'];
  const subpaths =
    typeof exportsField === 'object' && exportsField !== null
      ? Object.keys(exportsField).filter((subpath) => subpath !== './package.json')
      : [];
  const dependencies = manifest['dependencies'];
  const internalDependencies =
    typeof dependencies === 'object' && dependencies !== null
      ? Object.keys(dependencies).filter((name) => name.startsWith(PUBLISHED_SCOPE))
      : [];
  const engines = manifest['engines'];
  const enginesNode =
    typeof engines === 'object' && engines !== null
      ? (engines as Readonly<Record<string, unknown>>)['node']
      : undefined;
  return {
    name: String(manifest['name']),
    version: String(manifest['version']),
    tarball,
    enginesNode: typeof enginesNode === 'string' ? enginesNode : '',
    subpaths,
    internalDependencies,
  };
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
