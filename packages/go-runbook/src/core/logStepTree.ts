import type { GOLogger, TreeNode } from '@go-automation/go-common/core';
import { renderTree } from '@go-automation/go-common/core';

/**
 * Indent of the tree a step writes under its own section header.
 *
 * Steps report at a fixed depth of the console narrative, so the base indent is
 * a constant of the flow; every branch below it is computed by `renderTree`.
 */
const STEP_TREE_INDENT = '  ';

/**
 * Writes a tree on the (optional) step logger, choosing the branch characters
 * from the position of each node.
 *
 * Does nothing when no logger is attached, so callers can drop the
 * `logger?.text(...)` guard on every single line.
 *
 * @param logger - Logger of the current run, absent when output is disabled
 * @param nodes - Nodes to render, in display order
 * @param indent - Base indent; defaults to the standard step depth
 *
 * @example
 * ```typescript
 * logStepTree(context.logger, [
 *   { label: `Pod app: ${podApp}` },
 *   { label: `Log group: ${logGroup}` },
 * ]);
 * ```
 */
export function logStepTree(
  logger: GOLogger | undefined,
  nodes: ReadonlyArray<TreeNode>,
  indent: string = STEP_TREE_INDENT,
): void {
  if (logger === undefined) {
    return;
  }
  for (const line of renderTree(nodes, { indent })) {
    logger.text(line);
  }
}
