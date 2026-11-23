import type { ErrorTreeNode } from '../types/ErrorTreeNode.js';
import type { KnownCaseDetection } from '../types/KnownCaseDetection.js';

/**
 * The distinct cases of the detections, in the order they were first detected, each with the number of errors it
 * recognized when more than one. In an error tree an error is counted once, whatever the number of paths that
 * reach it ({@link ErrorTreeNode.errorKey}); without a tree every detection is an error.
 *
 * Complexity: O(D) over the detections, or O(N) over the nodes of the tree.
 *
 * @param detections - Detections of an execution, in their order
 * @param nodes - Nodes of the error tree, when the execution investigated one
 * @returns The summary, `none` without detections
 *
 * @example
 * ```typescript
 * caseSummary(detections, tree.nodes); // 'inad-connect-timeout ×51, inad-unknown-error'
 * ```
 */
export function caseSummary(
  detections: ReadonlyArray<KnownCaseDetection>,
  nodes?: ReadonlyArray<ErrorTreeNode>,
): string {
  if (detections.length === 0) return 'none';
  const errors = new Map<string, Set<string>>();
  for (const { knownCase } of detections) if (!errors.has(knownCase.id)) errors.set(knownCase.id, new Set());
  if (nodes === undefined) {
    for (const [index, { knownCase }] of detections.entries()) errors.get(knownCase.id)?.add(String(index));
  } else {
    for (const node of nodes) {
      for (const { knownCase } of node.detections) errors.get(knownCase.id)?.add(node.errorKey);
    }
  }
  return [...errors].map(([id, keys]) => (keys.size > 1 ? `${id} ×${String(keys.size)}` : id)).join(', ');
}
