import type { TreeNode } from '@pagopa/go-common/render';

/**
 * The narrative of a CloudWatch query that failed: a `⚠ Query fallita` node with the log groups and the cause.
 *
 * @param logGroups - Log groups of the query
 * @param errorMessage - Cause of the failure
 * @returns The node to report
 *
 * @example
 * ```typescript
 * reporter.add(queryFailedNode(['/aws/ecs/pn-delivery'], 'AccessDenied'));
 * ```
 */
export function queryFailedNode(logGroups: ReadonlyArray<string>, errorMessage: string): TreeNode {
  const children: TreeNode[] = [];
  if (logGroups.length > 0) {
    children.push({ label: `Log group${logGroups.length === 1 ? '' : 's'}: ${logGroups.join(', ')}` });
  }
  children.push({ label: `Causa: ${errorMessage}` });
  return { label: '⚠ Query fallita', children };
}
