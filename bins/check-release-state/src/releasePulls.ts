import { DEVELOP_BRANCH, RELEASE_BRANCH_PREFIX, VERSION_PR_BRANCH } from './releaseConstants.js';
import type { GitHubPort } from './types/GitHubPort.js';
import type { PullRequestInfo } from './types/PullRequestInfo.js';

/**
 * Whether a head branch is the one of a release PR: `changeset-release/develop` (the PR of the
 * GitHub App, §9.3.1) or `release/*` (manual fallback, §9.3).
 *
 * @param headRef - Head branch name
 * @returns `true` for a release head branch
 */
function isReleaseHeadRef(headRef: string): boolean {
  return headRef === VERSION_PR_BRANCH || headRef.startsWith(RELEASE_BRANCH_PREFIX);
}

/**
 * Whether a pull request is a merged release PR: release head branch ({@link isReleaseHeadRef}) from
 * this repository, base `develop`, merged with a merge commit (§9.3). The branch name alone gives no
 * privilege: every condition must hold.
 *
 * @param pull - The pull request
 * @returns `true` for a merged release PR
 */
function isMergedReleasePull(pull: PullRequestInfo): boolean {
  return (
    pull.merged &&
    pull.mergeCommitSha !== undefined &&
    pull.sameRepository &&
    pull.baseRef === DEVELOP_BRANCH &&
    isReleaseHeadRef(pull.headRef)
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
