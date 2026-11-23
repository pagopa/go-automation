import { sumCloudWatchLogsQueryStatistics } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { StepDiagnostics } from '../../../../../engine/index.js';

/**
 * Diagnostics of a step that ran several CloudWatch Logs queries: rows,
 * statistics and executions summed over all of them.
 *
 * A query without statistics (a failed read, the rows kept from a divided read)
 * leaves the others: the total is that of the statistics available.
 *
 * @param diagnostics - Diagnostics of each query, `undefined` when a query had none
 * @returns The merged diagnostics, or `undefined` when no query has statistics
 */
export function mergeCloudWatchLogsDiagnostics(
  diagnostics: ReadonlyArray<StepDiagnostics | undefined>,
): StepDiagnostics | undefined {
  const values = diagnostics.flatMap((entry) => (entry?.cloudWatchLogs === undefined ? [] : [entry.cloudWatchLogs]));
  // A read without statistics leaves the others: the total is that of the statistics available.
  if (values.length === 0) return undefined;
  return {
    cloudWatchLogs: {
      rowsReturned: values.reduce((sum, value) => sum + value.rowsReturned, 0),
      statistics: sumCloudWatchLogsQueryStatistics(values.map((value) => value.statistics)),
      queryExecutions: values.flatMap((value) => value.queryExecutions),
    },
  };
}
