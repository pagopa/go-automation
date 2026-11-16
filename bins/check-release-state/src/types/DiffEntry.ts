/** One file changed between two commits (`git diff --name-status -M`). */
export interface DiffEntry {
  /** `A` added, `M` modified, `D` deleted, `R` renamed (with {@link DiffEntry.previousPath}). */
  readonly status: 'A' | 'M' | 'D' | 'R';
  /** Path after the change (for a deletion, the deleted path). */
  readonly path: string;
  /** Path before a rename. */
  readonly previousPath?: string;
}
