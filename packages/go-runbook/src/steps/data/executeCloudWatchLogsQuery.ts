import type {
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryResult,
  ResultField,
} from '@go-automation/go-common/aws';
import { formatBytes } from '@go-automation/go-common/core';

import type { TimeRange } from '../../types/TimeRange.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { CloudWatchLogsStepDiagnostics, StepDiagnostics } from '../../trace/StepDiagnostics.js';

type CloudWatchLogsRows = ReadonlyArray<ReadonlyArray<ResultField>>;

export interface ExecutedCloudWatchLogsQuery {
  readonly rows: CloudWatchLogsRows;
  readonly diagnostics?: StepDiagnostics;
}

export async function executeCloudWatchLogsQuery(
  context: RunbookContext,
  logGroups: ReadonlyArray<string>,
  query: string,
  timeRange: TimeRange,
  options: AWSCloudWatchLogsQueryOptions,
): Promise<ExecutedCloudWatchLogsQuery> {
  const service = context.services.cloudWatchLogs;

  if (service.queryWithStatistics !== undefined) {
    const result = await service.queryWithStatistics(logGroups, query, timeRange, options);
    const cloudWatchLogs = toCloudWatchLogsDiagnostics(result);
    logQueryStatistics(context, cloudWatchLogs);
    return { rows: result.rows, diagnostics: { cloudWatchLogs } };
  }

  return { rows: await service.query(logGroups, query, timeRange, options) };
}

function toCloudWatchLogsDiagnostics(result: AWSCloudWatchLogsQueryResult): CloudWatchLogsStepDiagnostics {
  return {
    rowsReturned: result.rows.length,
    statistics: result.statistics,
    queryExecutions: result.queryExecutions,
  };
}

function logQueryStatistics(context: RunbookContext, diagnostics: CloudWatchLogsStepDiagnostics): void {
  const logger = context.logger;
  if (logger === undefined) return;

  const stats = diagnostics.statistics;
  const queryIds = diagnostics.queryExecutions.map((execution) => execution.queryId).join(', ');
  const querySuffix = queryIds === '' ? '' : `, queryIds=${queryIds}`;
  const rowsReturned = `${diagnostics.rowsReturned}${querySuffix}`;
  const bytesFormatted = formatBytes(stats.bytesScanned);

  logger.text(`  ├─ Query bytes stats: bytesScanned=${stats.bytesScanned} (${bytesFormatted})`);
  logger.text(
    `  ├─ Query record stats: recordsScanned=${stats.recordsScanned}, recordsMatched=${stats.recordsMatched}, rowsReturned=${rowsReturned}`,
  );
}
