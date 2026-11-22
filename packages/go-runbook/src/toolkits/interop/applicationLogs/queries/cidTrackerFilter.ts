import { escapeLogsInsightsString } from '@pagopa/go-aws/cloudwatch-logs/insights';

/**
 * The filter of a CID tracker query: the `cid` its `parse` extracts is one of the CIDs of the batch.
 *
 * @param cids - CIDs of the batch
 * @returns The `filter` command, without the leading pipe
 *
 * @example
 * ```typescript
 * cidTrackerFilter(['a', 'b']); // 'filter cid in ["a", "b"]'
 * ```
 */
export function cidTrackerFilter(cids: ReadonlyArray<string>): string {
  return `filter cid in [${cids.map((cid) => `"${escapeLogsInsightsString(cid)}"`).join(', ')}]`;
}
