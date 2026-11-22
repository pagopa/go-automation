import type {
  AWSCloudWatchLogsFailedRead,
  AWSCloudWatchLogsQueryExecution,
} from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { StepCoverage } from '../../../../../engine/index.js';

/** Rows Logs Insights returns at most when the query sets no `limit`. */
const DEFAULT_ROW_LIMIT = 10_000;
/** Every `| limit N` command of a query: the last one bounds the result. */
const LIMIT_COMMAND = /\|\s*limit\s+(\d+)/giu;
/** Prefix of a log group ARN up to its name. */
const LOG_GROUP_ARN = /^arn:aws:logs:[^:]*:[^:]*:log-group:/u;

/**
 * The incomplete parts of a Logs Insights read, measured on each physical query before its rows are merged.
 *
 * - A query is `saturated` when it returned as many rows as its limit, or left result pages unread.
 * - A page that could not be fetched, or a read that failed after every candidate, is `unavailable`.
 *
 * The source is the log group name, never an ARN or a profile.
 *
 * @param query - Query text, whose last `limit` command bounds each physical query
 * @param executions - Physical queries that answered
 * @param failedReads - Reads that failed
 * @returns One entry per incomplete physical query or failed read; empty when the read is complete
 *
 * @example
 * ```typescript
 * queryCoverage('fields @message | limit 100', [{ ...execution, rowsReturned: 100 }], []);
 * // [{ source: '/aws/ecs/pn-delivery', complete: false, reason: 'saturated' }]
 * ```
 */
export function queryCoverage(
  query: string,
  executions: ReadonlyArray<AWSCloudWatchLogsQueryExecution>,
  failedReads: ReadonlyArray<AWSCloudWatchLogsFailedRead>,
): ReadonlyArray<StepCoverage> {
  const limit = queryRowLimit(query);
  const coverage: StepCoverage[] = [];
  for (const execution of executions) {
    if (execution.unreadPages === 'failed') {
      coverage.push({
        source: sourceOf(execution.logGroups),
        complete: false,
        reason: 'unavailable',
        detail: 'result pages could not be read',
      });
    } else if (execution.unreadPages === 'budget' || (execution.rowsReturned ?? 0) >= limit) {
      coverage.push({ source: sourceOf(execution.logGroups), complete: false, reason: 'saturated' });
    }
  }
  for (const read of failedReads) {
    coverage.push({
      source: sourceOf(read.logGroups),
      complete: false,
      reason: 'unavailable',
      detail: read.error.message,
    });
  }
  return coverage;
}

/**
 * The row limit of a query: its last `limit` command, or the Logs Insights default.
 *
 * @param query - Query text
 * @returns The maximum rows one physical query can return
 */
export function queryRowLimit(query: string): number {
  let limit = DEFAULT_ROW_LIMIT;
  for (const match of query.matchAll(LIMIT_COMMAND)) limit = Number(match[1]);
  return limit;
}

function sourceOf(logGroups: ReadonlyArray<string>): string {
  return logGroups.map((logGroup) => logGroup.trim().replace(LOG_GROUP_ARN, '')).join(', ');
}
