/**
 * A node of a console tree: a label plus its (optional) children.
 *
 * Position in the structure is what decides the branch characters, so callers
 * never write `├─` or `└─` themselves.
 */
export interface TreeNode {
  readonly label: string;
  readonly children?: ReadonlyArray<TreeNode>;
}
