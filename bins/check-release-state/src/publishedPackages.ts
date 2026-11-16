import { PACKAGES_DIRECTORY, PUBLISHED_SCOPE } from './releaseConstants.js';
import type { GitPort } from './types/GitPort.js';
import type { PackageVersion } from './types/PackageVersion.js';
import type { PublishedManifest } from './types/PublishedManifest.js';

/**
 * Parses a `package.json` text.
 *
 * @param text - File content
 * @returns The manifest, or `undefined` when it is not a JSON object
 */
export function parseManifest(text: string): Readonly<Record<string, unknown>> | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Readonly<Record<string, unknown>>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether a manifest describes a published package: `@pagopa/*` and not private (§9.1).
 *
 * @param manifest - Parsed `package.json`
 * @returns `true` for a published package
 */
export function isPublishedManifest(manifest: Readonly<Record<string, unknown>>): boolean {
  const name = manifest['name'];
  return typeof name === 'string' && name.startsWith(PUBLISHED_SCOPE) && manifest['private'] !== true;
}

/**
 * The published packages of the workspace at one commit, read from git (not from the working tree).
 *
 * @param git - Git access
 * @param commit - Commit to read
 * @returns Published manifests by package name
 */
export function readPublishedManifests(git: GitPort, commit: string): ReadonlyMap<string, PublishedManifest> {
  const published = new Map<string, PublishedManifest>();
  for (const directory of git.listDirectory(commit, PACKAGES_DIRECTORY)) {
    const text = git.showFile(commit, `${PACKAGES_DIRECTORY}/${directory}/package.json`);
    const manifest = text === undefined ? undefined : parseManifest(text);
    if (manifest === undefined || !isPublishedManifest(manifest)) continue;
    const name = String(manifest['name']);
    const version = manifest['version'];
    if (typeof version !== 'string') throw new Error(`${name} at ${commit} has no version`);
    published.set(name, { name, version, directory, manifest });
  }
  return published;
}

/**
 * The git tag of a package version, as Changesets names it: `<name>@<version>`.
 *
 * @param packageVersion - Package and version
 * @returns The tag name
 */
export function tagName(packageVersion: PackageVersion): string {
  return `${packageVersion.name}@${packageVersion.version}`;
}

/**
 * A release PR must be merged with a real merge commit (two parents): only then the first parent is
 * the base branch before the release and the versions of the whole PR can be computed. A squash or a
 * rebase would hide part of the PR (with a rebase, the last commit holds only its own changes).
 *
 * @param git - Git access
 * @param releaseCommit - The commit to check
 * @throws Error when the commit is not a merge commit
 */
export function assertMergeCommit(git: GitPort, releaseCommit: string): void {
  const parents = git.parents(releaseCommit).length;
  if (parents !== 2) {
    throw new Error(
      `${releaseCommit} has ${String(parents)} parent(s): release PRs must be merged with "Create a merge commit"`,
    );
  }
}

/**
 * The versions decided by a release: the published packages whose `version` changes between the
 * first parent of the release commit (the base branch before the merge) and the commit itself (§9.3).
 * The release commit must be a merge commit ({@link assertMergeCommit}).
 *
 * @param git - Git access
 * @param releaseCommit - Merge commit of a release PR
 * @returns The new versions, sorted by package name
 */
export function releaseVersions(git: GitPort, releaseCommit: string): ReadonlyArray<PackageVersion> {
  assertMergeCommit(git, releaseCommit);
  const before = readPublishedManifests(git, git.firstParent(releaseCommit));
  const after = readPublishedManifests(git, releaseCommit);
  const changed = [...after.values()]
    .filter((entry) => before.get(entry.name)?.version !== entry.version)
    .map((entry): PackageVersion => ({ name: entry.name, version: entry.version }));
  changed.sort((left, right) => left.name.localeCompare(right.name));
  return changed;
}
