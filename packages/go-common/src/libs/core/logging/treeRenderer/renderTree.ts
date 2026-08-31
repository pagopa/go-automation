import type { TreeChars } from './TreeChars.js';
import { TREE_CHARS } from './TreeChars.js';
import type { TreeNode } from './TreeNode.js';

/** Options accepted by {@link renderTree}. */
export interface RenderTreeOptions {
  /** Prefix put before every top-level branch. Defaults to two spaces. */
  readonly indent?: string;
  /** Box-drawing characters. Defaults to {@link TREE_CHARS}. */
  readonly chars?: TreeChars;
}

function renderLevel(nodes: ReadonlyArray<TreeNode>, prefix: string, chars: TreeChars, lines: string[]): void {
  const lastIndex = nodes.length - 1;
  for (const [index, node] of nodes.entries()) {
    const isLast = index === lastIndex;
    const branch = isLast ? chars.elbow : chars.tee;
    lines.push(`${prefix}${branch} ${node.label}`);
    const children = node.children ?? [];
    if (children.length === 0) {
      continue;
    }
    // Children hang under the parent's label: a `tee` keeps the vertical
    // running, an `elbow` leaves blank space of the very same width.
    const continuation = isLast ? ' '.repeat(chars.elbow.length) : chars.pipe.padEnd(chars.tee.length, ' ');
    renderLevel(children, `${prefix}${continuation} `, chars, lines);
  }
}

/**
 * Renders a tree as console lines, choosing every branch character from the
 * position of the node instead of taking it from the caller.
 *
 * Complexity: O(N) in the number of nodes.
 *
 * @param nodes - Top-level nodes, in display order
 * @param options - Indent and characters overrides
 * @returns One string per line, without trailing newlines
 *
 * @example
 * ```typescript
 * renderTree([
 *   { label: 'Query fallita', children: [{ label: 'Causa: AccessDenied' }] },
 * ]);
 * // [ '  └─ Query fallita', '     └─ Causa: AccessDenied' ]
 * ```
 */
export function renderTree(nodes: ReadonlyArray<TreeNode>, options: RenderTreeOptions = {}): ReadonlyArray<string> {
  const lines: string[] = [];
  renderLevel(nodes, options.indent ?? '  ', options.chars ?? TREE_CHARS, lines);
  return lines;
}
