import type {
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryResult,
} from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { formatBytes } from '@pagopa/go-common/utils';

import type { TimeRange } from '../../../time/TimeRange.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { StepDiagnostics } from '../../../../../engine/tracing/StepDiagnostics.js';
import type { CloudWatchLogsStepDiagnostics } from '../../../telemetry/CloudWatchLogsStepDiagnostics.js';

type CloudWatchLogsRows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;

export interface ExecutedCloudWatchLogsQuery {
  readonly rows: CloudWatchLogsRows;
  readonly diagnostics?: StepDiagnostics;
}

export async function executeCloudWatchLogsQuery(
  context: OperationalContext,
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
