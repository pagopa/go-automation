import type { RunbookExecutionResult } from '../../engine/types/RunbookExecutionResult.js';

/**
 * The variables of a node of the error tree of an execution: the first node of the target, the first root node when
 * no target is given. Empty when there is no such node.
 *
 * @param result - Result of the execution
 * @param target - Level of the node
 * @returns The variables of the node
 *
 * @example
 * ```typescript
 * treeNodeVars(result).get('apiGwStatusCode'); // '500'
 * ```
 */
export function treeNodeVars(result: RunbookExecutionResult, target?: string): ReadonlyMap<string, string> {
  const node = result.tree?.find((candidate) =>
    target === undefined ? candidate.parentId === undefined : candidate.target === target,
  );
  return (node === undefined ? undefined : result.nodeContexts?.get(node.id)?.vars) ?? new Map();
}
