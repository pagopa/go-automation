/** Where the reproduction runs and what it compares. */
export interface ReproductionInput {
  /**
   * Trusted checkout of the **base** of the release PR, with its `node_modules` installed: the
   * validator and Changesets run from here, never from the PR.
   */
  readonly repositoryRoot: string;
  /** Base commit of the PR. */
  readonly base: string;
  /** Head commit of the PR, read only as data through git. */
  readonly head: string;
  /** Empty folder for the worktree of the base. */
  readonly workDirectory: string;
}
