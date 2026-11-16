import { DEVELOP_BRANCH, RELEASE_BRANCH_PREFIX } from './releaseConstants.js';
import type { GitHubPort } from './types/GitHubPort.js';
import type { PullRequestInfo } from './types/PullRequestInfo.js';

/**
 * Whether a pull request is a merged release PR: head `release/*` from this repository, base
 * `develop`, merged with a merge commit (§9.3). The branch name alone gives no privilege: every
 * condition must hold.
 *
 * @param pull - The pull request
 * @returns `true` for a merged release PR
 */
export function isMergedReleasePull(pull: PullRequestInfo): boolean {
  return (
    pull.merged &&
    pull.mergeCommitSha !== undefined &&
    pull.sameRepository &&
    pull.baseRef === DEVELOP_BRANCH &&
    pull.headRef.startsWith(RELEASE_BRANCH_PREFIX)
  );
}

/**
 * Merge commits of every merged release PR, oldest PR first.
 *
 * @param github - GitHub access
 * @returns `[PR number, merge commit]` pairs
 */
export async function mergedReleaseCommits(github: GitHubPort): Promise<ReadonlyArray<readonly [number, string]>> {
  const pulls = (await github.closedPulls(DEVELOP_BRANCH)).filter(isMergedReleasePull);
  const commits = pulls.map((pull): readonly [number, string] => [pull.number, pull.mergeCommitSha ?? '']);
  commits.sort(([left], [right]) => left - right);
  return commits;
}
