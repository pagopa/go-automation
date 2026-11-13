import { sumCloudWatchLogsQueryStatistics } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { StepDiagnostics } from '../../../../../engine/tracing/StepDiagnostics.js';

/**
 * Diagnostics of a step that ran several CloudWatch Logs queries: rows,
 * statistics and executions summed over all of them (EVO-RBREORG-OPUS-01 P30).
 *
 * The sum is reported only when every query has statistics, so a partial total
 * is never presented as complete.
 *
 * @param diagnostics - Diagnostics of each query, `undefined` when a query had none
 * @returns The merged diagnostics, or `undefined` when there are no queries or one lacks statistics
 */
export function mergeCloudWatchLogsDiagnostics(
  diagnostics: ReadonlyArray<StepDiagnostics | undefined>,
): StepDiagnostics | undefined {
  const values = diagnostics.flatMap((entry) => (entry?.cloudWatchLogs === undefined ? [] : [entry.cloudWatchLogs]));
  if (values.length === 0 || values.length !== diagnostics.length) return undefined;
  return {
    cloudWatchLogs: {
      rowsReturned: values.reduce((sum, value) => sum + value.rowsReturned, 0),
      statistics: sumCloudWatchLogsQueryStatistics(values.map((value) => value.statistics)),
      queryExecutions: values.flatMap((value) => value.queryExecutions),
    },
  };
}
