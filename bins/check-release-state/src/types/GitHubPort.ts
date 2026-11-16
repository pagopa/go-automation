import type { PullRequestInfo } from './PullRequestInfo.js';

/** The GitHub API reads of the release checks. Tests use a fake. */
export interface GitHubPort {
  /** Pull requests associated with a commit (for a merge commit, the PR that created it). */
  pullsForCommit(commit: string): Promise<ReadonlyArray<PullRequestInfo>>;
  /** Every closed pull request towards a base branch, merged or not. */
  closedPulls(baseRef: string): Promise<ReadonlyArray<PullRequestInfo>>;
}
