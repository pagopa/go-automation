import { parseChangesetFile } from '@changesets/parse';

import { effectiveDependencies, readCatalogs } from './effectiveDependencies.js';
import { readPublishedManifests, tagName } from './publishedPackages.js';
import { CHANGESET_DIRECTORY, PACKAGES_DIRECTORY, PUBLISHED_SCOPE } from './releaseConstants.js';
import type { DiffEntry } from './types/DiffEntry.js';
import type { DirectoryPredicate } from './types/DirectoryPredicate.js';
import type { GitPort } from './types/GitPort.js';
import type { PublishedManifest } from './types/PublishedManifest.js';

const PRE_STATE = `${CHANGESET_DIRECTORY}/pre.json`;
const PRE_FOLDER = `${CHANGESET_DIRECTORY}/pre/`;
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
/**
 * Markdown files of `.changeset/` that the Changesets reader ignores (`@changesets/read` 1.0.1, used by the
 * pinned CLI), besides hidden files. A changeset with one of these names would never be released.
 */
const IGNORED_CHANGESET_NAMES: ReadonlySet<string> = new Set(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']);

/** Published package directories (`packages/<dir>`) at both ends of a diff. */
function publishedDirectories(
  base: ReadonlyMap<string, PublishedManifest>,
  head: ReadonlyMap<string, PublishedManifest>,
): ReadonlySet<string> {
  return new Set([...base.values(), ...head.values()].map((entry) => `${PACKAGES_DIRECTORY}/${entry.directory}`));
}

/** `packages/<dir>` of a path inside a package folder, `undefined` elsewhere. */
function packageDirectoryOf(filePath: string): string | undefined {
  const [root, directory] = filePath.split('/');
  return root === PACKAGES_DIRECTORY && directory !== undefined ? `${root}/${directory}` : undefined;
}

/** A Markdown file directly in `.changeset/` (not in `pre/`). */
function isChangesetFolderMarkdown(filePath: string): boolean {
  if (!filePath.startsWith(`${CHANGESET_DIRECTORY}/`) || !filePath.endsWith('.md')) return false;
  return !filePath.slice(CHANGESET_DIRECTORY.length + 1).includes('/');
}

/** Whether the Changesets reader ignores a file of `.changeset/`: hidden files and reserved names. */
function isIgnoredByChangesets(filePath: string): boolean {
  const name = filePath.slice(filePath.lastIndexOf('/') + 1);
  // Like the pinned reader: README.md case-insensitively, AGENTS/CLAUDE/GEMINI.md exactly.
  return name.startsWith('.') || name.toLowerCase() === 'readme.md' || IGNORED_CHANGESET_NAMES.has(name);
}

/** A changeset file the Changesets reader picks up: directly in `.changeset/`, not hidden, not reserved. */
function isChangesetFile(filePath: string): boolean {
  return isChangesetFolderMarkdown(filePath) && !isIgnoredByChangesets(filePath);
}

/** A consumed prerelease changeset in `.changeset/pre/` (Changesets 3 moves them there in pre mode). */
function isPreChangesetFile(filePath: string): boolean {
  return (
    filePath.startsWith(PRE_FOLDER) && filePath.endsWith('.md') && !filePath.slice(PRE_FOLDER.length).includes('/')
  );
}

/** The manifest without `version` and with the internal `@pagopa/*` ranges blanked, for comparison. */
function withoutReleaseFields(manifest: Readonly<Record<string, unknown>>): string {
  const copy: Record<string, unknown> = { ...manifest };
  delete copy['version'];
  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = copy[field];
    if (typeof dependencies !== 'object' || dependencies === null) continue;
    copy[field] = Object.fromEntries(
      Object.entries(dependencies).map(([name, range]) => [name, name.startsWith(PUBLISHED_SCOPE) ? '*' : range]),
    );
  }
  return JSON.stringify(copy);
}

/**
 * Perimeter of a release PR (§10.3, adapted to Changesets 3). The PR may only:
 *
 * - change `version` and the internal `@pagopa/*` ranges in the `package.json` of published packages;
 * - add or change their `CHANGELOG.md`;
 * - delete `.changeset/<id>.md`, or move it to `.changeset/pre/<id>.md` (pre mode);
 * - delete `.changeset/pre/<id>.md` (exit from pre mode);
 * - add, change or delete `.changeset/pre.json`.
 *
 * @param git - Git access
 * @param base - Base commit of the PR
 * @param head - Head commit of the PR
 * @returns One message per change outside the perimeter
 */
export function checkReleasePerimeter(git: GitPort, base: string, head: string): ReadonlyArray<string> {
  const baseManifests = readPublishedManifests(git, base);
  const headManifests = readPublishedManifests(git, head);
  const published = publishedDirectories(baseManifests, headManifests);
  const byDirectory = (
    manifests: ReadonlyMap<string, PublishedManifest>,
    directory: string,
  ): PublishedManifest | undefined =>
    [...manifests.values()].find((entry) => `${PACKAGES_DIRECTORY}/${entry.directory}` === directory);
  const diff = git.diff(base, head);
  const deletedChangesets = new Set(
    diff.filter((entry) => entry.status === 'D' && isChangesetFile(entry.path)).map((entry) => entry.path),
  );
  const violations: string[] = [];
  for (const entry of diff) {
    const allowed = isAllowedReleaseChange(entry, published, deletedChangesets, (directory) => {
      const before = byDirectory(baseManifests, directory);
      const after = byDirectory(headManifests, directory);
      return (
        before !== undefined &&
        after !== undefined &&
        withoutReleaseFields(before.manifest) === withoutReleaseFields(after.manifest)
      );
    });
    if (!allowed) violations.push(`${describe(entry)} is outside the perimeter of a release PR`);
  }
  return violations;
}

function isAllowedReleaseChange(
  entry: DiffEntry,
  published: ReadonlySet<string>,
  deletedChangesets: ReadonlySet<string>,
  onlyReleaseFieldsChanged: DirectoryPredicate,
): boolean {
  const directory = packageDirectoryOf(entry.path);
  if (directory !== undefined && published.has(directory)) {
    if (entry.path === `${directory}/CHANGELOG.md`) return entry.status === 'A' || entry.status === 'M';
    if (entry.path === `${directory}/package.json`) return entry.status === 'M' && onlyReleaseFieldsChanged(directory);
    return false;
  }
  if (entry.path === PRE_STATE) return entry.status !== 'R';
  if (entry.status === 'D') return isChangesetFile(entry.path) || isPreChangesetFile(entry.path);
  if (entry.status === 'R') {
    const previous = entry.previousPath ?? '';
    return isChangesetFile(previous) && entry.path === `${PRE_FOLDER}${previous.slice(CHANGESET_DIRECTORY.length + 1)}`;
  }
  if (entry.status === 'A' && isPreChangesetFile(entry.path)) {
    // A move without rename detection: the same id must be deleted from `.changeset/`.
    return deletedChangesets.has(`${CHANGESET_DIRECTORY}/${entry.path.slice(PRE_FOLDER.length)}`);
  }
  return false;
}

function describe(entry: DiffEntry): string {
  return entry.status === 'R' ? `R ${entry.previousPath ?? '?'} → ${entry.path}` : `${entry.status} ${entry.path}`;
}

/**
 * Release metadata a contribution PR must not touch (§10.3, `changeset-required`): the `version` of a
 * published package, its `CHANGELOG.md`, `.changeset/pre.json` and `.changeset/pre/`. Those change
 * only in a release PR, produced by `changeset version`. Versions are compared with the merge base,
 * like the diff: a base that moved on through a release does not count as a change of the PR.
 *
 * @param git - Git access
 * @param base - Base commit of the PR
 * @param head - Head commit of the PR
 * @returns One message per forbidden change
 */
export function checkContribution(git: GitPort, base: string, head: string): ReadonlyArray<string> {
  const baseManifests = readPublishedManifests(git, git.mergeBase(base, head));
  const headManifests = readPublishedManifests(git, head);
  const published = publishedDirectories(baseManifests, headManifests);
  const violations: string[] = [];
  for (const [name, after] of headManifests) {
    const before = baseManifests.get(name);
    if (before !== undefined && before.version !== after.version) {
      violations.push(
        `${name}: version changed by hand (${before.version} → ${after.version}); versions change only in a release PR`,
      );
    }
  }
  for (const entry of git.diff(base, head)) {
    const paths = [entry.path, ...(entry.previousPath === undefined ? [] : [entry.previousPath])];
    for (const filePath of paths) {
      const directory = packageDirectoryOf(filePath);
      const changelog = directory !== undefined && published.has(directory) && filePath === `${directory}/CHANGELOG.md`;
      if (changelog || filePath === PRE_STATE || filePath.startsWith(PRE_FOLDER)) {
        violations.push(`${describe(entry)}: release metadata change only in a release PR`);
        break;
      }
    }
  }
  return violations;
}

/**
 * Package names of a changeset, parsed with the parser of the pinned Changesets (`@changesets/parse`):
 * the same YAML rules, duplicate keys and invalid bump types included.
 *
 * @param text - Changeset content
 * @returns The names (empty for an empty changeset), or the parser error
 */
export function changesetPackages(text: string): ReadonlyArray<string> | Error {
  try {
    return parseChangesetFile(text).releases.map((release) => release.name);
  } catch (error: unknown) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Every published package changed by a contribution PR must be named in a changeset the PR adds
 * (§10.3, `changeset-required`). A package is changed when a file in its folder changes or when its
 * effective dependency ranges change (for example a `catalog:` bump in `pnpm-workspace.yaml`). A PR that adds an **empty** changeset (`pnpm changeset --empty`)
 * declares that the rest needs no release. Changeset files must be parsed by Changesets itself, use a
 * name its reader does not ignore, and name only published packages.
 *
 * @param git - Git access
 * @param base - Base commit of the PR
 * @param head - Head commit of the PR
 * @returns One message per uncovered package or invalid changeset
 */
export function checkChangesetCoverage(git: GitPort, base: string, head: string): ReadonlyArray<string> {
  const start = git.mergeBase(base, head);
  const startManifests = readPublishedManifests(git, start);
  const headManifests = readPublishedManifests(git, head);
  const byDirectory = new Map(
    [...startManifests.values(), ...headManifests.values()].map((entry) => [
      `${PACKAGES_DIRECTORY}/${entry.directory}`,
      entry.name,
    ]),
  );
  const changed = new Set<string>();
  // A catalog bump changes what a package ships without touching its folder (`catalog:` ranges).
  const startCatalogs = readCatalogs(git, start);
  const headCatalogs = readCatalogs(git, head);
  for (const [name, after] of headManifests) {
    const before = startManifests.get(name);
    if (
      before !== undefined &&
      effectiveDependencies(before.manifest, startCatalogs) !== effectiveDependencies(after.manifest, headCatalogs)
    ) {
      changed.add(name);
    }
  }
  const named = new Set<string>();
  const violations: string[] = [];
  let empty = false;
  for (const entry of git.diff(base, head)) {
    for (const filePath of [entry.path, ...(entry.previousPath === undefined ? [] : [entry.previousPath])]) {
      const directory = packageDirectoryOf(filePath);
      const name = directory === undefined ? undefined : byDirectory.get(directory);
      if (name !== undefined) changed.add(name);
    }
    if (entry.status === 'D' || !isChangesetFolderMarkdown(entry.path)) continue;
    if (isIgnoredByChangesets(entry.path)) {
      if (entry.status === 'A' || entry.status === 'R') {
        violations.push(`${entry.path} is ignored by Changesets (hidden or reserved name): rename it`);
      }
      continue;
    }
    const packages = changesetPackages(git.showFile(head, entry.path) ?? '');
    if (packages instanceof Error) {
      violations.push(`${entry.path} is not a valid changeset: ${packages.message.split('\n')[0] ?? ''}`);
      continue;
    }
    if (packages.length === 0) empty = true;
    for (const name of packages) {
      if (headManifests.has(name)) named.add(name);
      else violations.push(`${entry.path} names ${name}, which is not a published package`);
    }
  }
  if (!empty) {
    for (const name of [...changed].sort()) {
      if (!named.has(name)) {
        violations.push(
          `${name} changed but no changeset of this PR names it: run pnpm changeset (or pnpm changeset --empty)`,
        );
      }
    }
  }
  return violations;
}

/**
 * Checks a promotion PR `develop` → `main` (§10.3, `promotion-guard`): every published version in the
 * head is already on `main`, or has its `<name>@<version>` tag on an ancestor of the head, which only
 * the Release workflow creates after publishing from a validated release.
 *
 * @param git - Git access
 * @param base - Base commit (`main`)
 * @param head - Head commit (`develop`)
 * @returns One message per version that does not come from a validated release
 */
export function checkPromotion(git: GitPort, base: string, head: string): ReadonlyArray<string> {
  const onMain = readPublishedManifests(git, base);
  const violations: string[] = [];
  for (const entry of readPublishedManifests(git, head).values()) {
    if (onMain.get(entry.name)?.version === entry.version) continue;
    const tag = tagName(entry);
    const tagged = git.tagCommit(tag);
    if (tagged === undefined) violations.push(`${tag} has no tag: it was not released by the Release workflow`);
    else if (!git.isAncestor(tagged, head))
      violations.push(`${tag} is tagged on ${tagged}, which is not in this promotion`);
  }
  return violations;
}

/**
 * Changesets not yet released at a commit (`.changeset/*.md`, README excluded): what the next release
 * PR will version.
 *
 * @param git - Git access
 * @param commit - Commit to read
 * @returns File names, sorted
 */
export function pendingChangesets(git: GitPort, commit: string): ReadonlyArray<string> {
  const pending = git
    .listDirectory(commit, CHANGESET_DIRECTORY)
    .filter((name) => isChangesetFile(`${CHANGESET_DIRECTORY}/${name}`));
  pending.sort();
  return pending;
}
