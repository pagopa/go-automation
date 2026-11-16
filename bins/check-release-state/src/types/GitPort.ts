import type { DiffEntry } from './DiffEntry.js';

/** The git operations of the release checks. The real implementation runs `git`; tests use a fake. */
export interface GitPort {
  /** Commit of `HEAD`. */
  head(): string;
  /** Parents of a commit (two for a merge commit). */
  parents(commit: string): ReadonlyArray<string>;
  /** First parent of a commit: for a merge commit, the base branch before the merge. */
  firstParent(commit: string): string;
  /** Content of a file at a commit, `undefined` when the file does not exist there. */
  showFile(commit: string, filePath: string): string | undefined;
  /** Best common ancestor of two commits (the start of a pull request). */
  mergeBase(left: string, right: string): string;
  /** Every file under a directory at a commit, recursively, as repository paths. */
  listFiles(commit: string, directory: string): ReadonlyArray<string>;
  /** Names of the entries of a directory at a commit (empty when it does not exist). */
  listDirectory(commit: string, directory: string): ReadonlyArray<string>;
  /** Files changed from the merge base of `base` and `head` to `head`, with rename detection. */
  diff(base: string, head: string): ReadonlyArray<DiffEntry>;
  /** Commit a tag points to, `undefined` when the tag does not exist. */
  tagCommit(tag: string): string | undefined;
  /** Creates an annotated tag on a commit (local only; the workflow pushes the tags). */
  createAnnotatedTag(tag: string, commit: string, message: string): void;
  /** Whether `ancestor` is an ancestor of (or equal to) `descendant`. */
  isAncestor(ancestor: string, descendant: string): boolean;
  /** Checks out `commit` (detached) in a new worktree at `directory`. */
  addWorktree(directory: string, commit: string): void;
  /** Removes a worktree created by {@link GitPort.addWorktree}. */
  removeWorktree(directory: string): void;
}
