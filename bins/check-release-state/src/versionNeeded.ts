import { parseManifest } from './publishedPackages.js';
import { isChangesetFile, isPreChangesetFile } from './pullRequestGuards.js';
import { CHANGESET_DIRECTORY } from './releaseConstants.js';
import type { GitPort } from './types/GitPort.js';

/**
 * Whether the release PR must be created or updated at a commit of `develop` (§9.3.1): the same rule
 * as `changesets/action` (`readChangesetState`). In pre mode only the changesets outside
 * `.changeset/pre/` count; otherwise the consumed prerelease changesets count too. In `exit` mode a
 * release PR is always needed, because only `changeset version` completes the exit.
 *
 * @param git - Git access
 * @param commit - Commit of `develop` to read
 * @returns `true` when `changeset version` has something to apply
 */
export function versionNeeded(git: GitPort, commit: string): boolean {
  const preState = parseManifest(git.showFile(commit, `${CHANGESET_DIRECTORY}/pre.json`) ?? '');
  const files = git.listFiles(commit, CHANGESET_DIRECTORY);
  const pending = files.filter(isChangesetFile).length;
  const consumed = files.filter(isPreChangesetFile).length;
  // Leaving the prerelease always needs `changeset version`, even with nothing to apply: it removes
  // pre.json (Changesets 3 allows versioning with zero changesets in exit mode).
  if (preState?.['mode'] === 'exit') return true;
  return pending + (preState?.['mode'] === 'pre' ? 0 : consumed) > 0;
}
