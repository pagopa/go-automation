/**
 * Box-drawing characters for a console tree.
 *
 * `tee` and `elbow` must have the same display width: the continuation prefix
 * of a node's children is sized on them.
 */
export interface TreeChars {
  /** Branch of a node that has siblings after it. */
  readonly tee: string;
  /** Branch of the last node of a level. */
  readonly elbow: string;
  /** Vertical continuation drawn under a `tee`. */
  readonly pipe: string;
}

/** The characters used by the runbook console output. */
export const TREE_CHARS: TreeChars = {
  tee: '├─',
  elbow: '└─',
  pipe: '│',
};
