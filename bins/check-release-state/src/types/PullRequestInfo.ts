/** The fields of a GitHub pull request that the release checks read. */
export interface PullRequestInfo {
  readonly number: number;
  readonly merged: boolean;
  /** Commit created by the merge, `undefined` while the PR is open. */
  readonly mergeCommitSha?: string;
  readonly headRef: string;
  readonly baseRef: string;
  /** The head branch belongs to this repository (not to a fork). */
  readonly sameRepository: boolean;
}
