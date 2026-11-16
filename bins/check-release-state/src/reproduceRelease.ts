import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { parseManifest, readPublishedManifests } from './publishedPackages.js';
import { CHANGESET_DIRECTORY, PACKAGES_DIRECTORY, PRERELEASE_TAG } from './releaseConstants.js';
import type { GitPort } from './types/GitPort.js';
import type { ReproductionInput } from './types/ReproductionInput.js';
import type { RunCommandFn } from './types/RunCommandFn.js';

const PRE_STATE = `${CHANGESET_DIRECTORY}/pre.json`;

/** Pre mode of a `.changeset/pre.json`: `pre` with its tag, `exit`, or none. */
function preMode(text: string | undefined): { readonly mode?: string; readonly tag?: string } {
  const state = text === undefined ? undefined : parseManifest(text);
  const mode = state?.['mode'];
  const tag = state?.['tag'];
  return { ...(typeof mode === 'string' ? { mode } : {}), ...(typeof tag === 'string' ? { tag } : {}) };
}

/**
 * Reproduces a release PR (§10.3, `release-pr-guard` point 3). The PR is only **data**: its files are
 * read through git, and nothing from it is executed. In a worktree of the base, the pre mode is brought
 * to the state of the head (`pre enter next` or `pre exit`, only when it changes), `changeset version`
 * runs with the base's own Changesets, and every file of the release perimeter is compared with the
 * head: the `package.json` and `CHANGELOG.md` of the published packages and the whole `.changeset/`
 * folder. They must be identical, internal dependency propagation included. The only prerelease
 * channel is `next` (§9.2): any other tag is rejected before running anything.
 *
 * @param git - Git access
 * @param run - Command runner (the worktree reuses the `node_modules` of the trusted checkout)
 * @param input - Folders and commits
 * @returns One message per problem; empty when the release is reproducible
 */
export async function reproduceRelease(
  git: GitPort,
  run: RunCommandFn,
  input: ReproductionInput,
): Promise<ReadonlyArray<string>> {
  const headPre = preMode(git.showFile(input.head, PRE_STATE));
  if (headPre.mode !== undefined && (headPre.mode !== 'pre' || headPre.tag !== PRERELEASE_TAG)) {
    return [
      `${PRE_STATE} must be absent or {"mode":"pre","tag":"${PRERELEASE_TAG}"}, found mode ${headPre.mode ?? '?'} tag ${headPre.tag ?? '?'}`,
    ];
  }
  const worktree = path.join(input.workDirectory, 'base');
  git.addWorktree(worktree, input.base);
  try {
    await fs.symlink(path.join(input.repositoryRoot, 'node_modules'), path.join(worktree, 'node_modules'), 'dir');
    const changeset = path.join(input.repositoryRoot, 'node_modules', '@changesets', 'cli', 'bin.js');
    const basePre = preMode(await readOptional(path.join(worktree, PRE_STATE)));
    const steps: ReadonlyArray<string>[] = [];
    if (headPre.mode === 'pre' && basePre.mode !== 'pre') steps.push(['pre', 'enter', PRERELEASE_TAG]);
    if (headPre.mode === undefined && basePre.mode === 'pre') steps.push(['pre', 'exit']);
    steps.push(['version']);
    for (const args of steps) {
      const result = run(process.execPath, [changeset, ...args], worktree);
      if (result.status !== 0) {
        return [
          `changeset ${args.join(' ')} failed on the base: ${`${result.stderr}${result.stdout}`.trim().slice(-600)}`,
        ];
      }
    }
    return await compareRelease(git, input, worktree);
  } finally {
    git.removeWorktree(worktree);
  }
}

async function compareRelease(
  git: GitPort,
  input: ReproductionInput,
  worktree: string,
): Promise<ReadonlyArray<string>> {
  const directories = new Set(
    [...readPublishedManifests(git, input.base).values(), ...readPublishedManifests(git, input.head).values()].map(
      (entry) => `${PACKAGES_DIRECTORY}/${entry.directory}`,
    ),
  );
  const files = new Set<string>(git.listFiles(input.head, CHANGESET_DIRECTORY));
  for (const directory of directories) {
    files.add(`${directory}/package.json`);
    files.add(`${directory}/CHANGELOG.md`);
  }
  for (const file of await listFiles(worktree, CHANGESET_DIRECTORY)) files.add(file);
  const differences: string[] = [];
  for (const file of [...files].sort()) {
    const expected = await readOptional(path.join(worktree, file));
    const actual = git.showFile(input.head, file);
    if (expected === actual) continue;
    if (expected === undefined) differences.push(`${file} is in the PR but changeset version does not produce it`);
    else if (actual === undefined) differences.push(`${file} is produced by changeset version but missing in the PR`);
    else differences.push(`${file} differs from what changeset version produces on the base`);
  }
  return differences;
}

/** Files under a folder of the worktree, recursively, as repository paths. */
async function listFiles(root: string, folder: string): Promise<ReadonlyArray<string>> {
  const files: string[] = [];
  const pending = [folder];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    let entries;
    try {
      entries = await fs.readdir(path.join(root, current), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const relative = `${current}/${entry.name}`;
      if (entry.isDirectory()) pending.push(relative);
      else files.push(relative);
    }
  }
  return files;
}

async function readOptional(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}
