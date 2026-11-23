import type {
  AWSCloudWatchLogsQueryExecution,
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryResult,
} from '@pagopa/go-aws/cloudwatch-logs/insights';
import { formatBytes } from '@pagopa/go-common/utils';

import type { TimeRange } from '../../../time/TimeRange.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { CloudWatchLogsStepDiagnostics } from '../../../telemetry/CloudWatchLogsStepDiagnostics.js';
import { queryCoverage, queryRowLimit } from './queryCoverage.js';
import type { ExecutedCloudWatchLogsQuery } from './ExecutedCloudWatchLogsQuery.js';
import { CLOUDWATCH_LOGS_SOURCE } from './CLOUDWATCH_LOGS_SOURCE.js';

/**
 * Runs a Logs Insights read of a runbook step through the context's reader, with partial results when the context's
 * read policy is `partial` (an alarm analysis); with the `strict` policy of a procedure a failed read throws.
 *
 * - The rows of the physical queries and pages that answered are returned, with their diagnostics.
 * - What was not read becomes coverage: a query at its row limit or with unread pages is `saturated`, a failed page or
 *   a read that failed after every candidate is `unavailable` (see `queryCoverage`).
 * - When no read answered at all, the error of the first failure is thrown, as without partial results: a step that
 *   could not read anything still fails.
 * - A reader without statistics returns its rows; reaching the query limit is then `saturated`.
 *
 * The read carries the abort signal of the context. Cancellation and configuration errors of the target always throw.
 *
 * @param context - Context of the step, whose `cloudWatchLogs` service runs the read
 * @param logGroups - Log groups to read
 * @param query - Logs Insights query
 * @param timeRange - Time range of the read
 * @param options - Options of the read, without the signal; `partialResults` follows the read policy of the context
 *   unless the caller sets it
 * @returns The rows, the diagnostics and the coverage of the read
 * @throws Error when no read answered, or on cancellation and target configuration errors
 *
 * @example
 * ```typescript
 * const { rows, coverage } = await executeCloudWatchLogsQuery(context, ['/aws/ecs/pn-delivery'], query, range, {});
 * ```
 */
export async function executeCloudWatchLogsQuery(
  context: OperationalContext,
  logGroups: ReadonlyArray<string>,
  query: string,
  timeRange: TimeRange,
  options: Omit<AWSCloudWatchLogsQueryOptions, 'signal'>,
): Promise<ExecutedCloudWatchLogsQuery> {
  try {
    const service = context.services.cloudWatchLogs;
    const signal = context.signal === undefined ? {} : { signal: context.signal };

    if (service.queryWithStatistics !== undefined) {
      // Partial reads only where the execution keeps partial evidence (an alarm analysis); a procedure reads strictly.
      const partialResults = context.readPolicy === 'partial';
      const result = await service.queryWithStatistics(logGroups, query, timeRange, {
        partialResults,
        ...options,
        ...signal,
      });
      const failedReads = result.failedReads ?? [];
      // Nothing answered: the read failed as a whole, exactly as without partial results.
      const firstFailure = failedReads[0];
      if (result.queryExecutions.length === 0 && firstFailure !== undefined) throw firstFailure.error;
      const cloudWatchLogs = toCloudWatchLogsDiagnostics(result);
      logQueryStatistics(context, cloudWatchLogs);
      return {
        rows: result.rows,
        diagnostics: { cloudWatchLogs },
        coverage: queryCoverage(query, withRowCounts(result), failedReads),
      };
    }

    const rows = await service.query(logGroups, query, timeRange, { ...options, ...signal });
    return {
      rows,
      coverage:
        rows.length >= queryRowLimit(query)
          ? [{ source: logGroups.join(', '), complete: false, reason: 'saturated' }]
          : [],
    };
  } catch (error: unknown) {
    // Counted once here, whatever the caller makes of the error: a failed read has no statistics.
    if (context.signal?.aborted !== true) {
      const failures = context.readFailures;
      failures?.set(CLOUDWATCH_LOGS_SOURCE, (failures.get(CLOUDWATCH_LOGS_SOURCE) ?? 0) + 1);
    }
    throw error;
  }
}

/**
 * The executions of a result, each with its row count: a reader that does not report it per query, with a
 * single execution, returned all the rows from that one.
 */
function withRowCounts(result: AWSCloudWatchLogsQueryResult): ReadonlyArray<AWSCloudWatchLogsQueryExecution> {
  const [only, ...others] = result.queryExecutions;
  if (only === undefined || others.length > 0 || only.rowsReturned !== undefined) return result.queryExecutions;
  return [{ ...only, rowsReturned: result.rows.length }];
}

function toCloudWatchLogsDiagnostics(result: AWSCloudWatchLogsQueryResult): CloudWatchLogsStepDiagnostics {
  return {
    rowsReturned: result.rows.length,
    statistics: result.statistics,
    queryExecutions: result.queryExecutions,
  };
}

function logQueryStatistics(context: OperationalContext, diagnostics: CloudWatchLogsStepDiagnostics): void {
  const stats = diagnostics.statistics;
  const queryIds = diagnostics.queryExecutions.map((execution) => execution.queryId).join(', ');
  const querySuffix = queryIds === '' ? '' : `, queryIds=${queryIds}`;
  const rowsReturned = `${diagnostics.rowsReturned}${querySuffix}`;
  const bytesFormatted = formatBytes(stats.bytesScanned);

  context.services.reporter.add(
    { label: `Query bytes stats: bytesScanned=${stats.bytesScanned} (${bytesFormatted})` },
    {
      label: `Query record stats: recordsScanned=${stats.recordsScanned}, recordsMatched=${stats.recordsMatched}, rowsReturned=${rowsReturned}`,
    },
  );
}
