import {
  type AWSCloudWatchLogsQueryStatistics,
  sumCloudWatchLogsQueryStatistics,
} from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { RunbookExecutionTrace, StepTrace } from '../../../engine/index.js';
import { CLOUDWATCH_LOGS_SOURCE } from '../steps/aws/cloudwatch-logs/CLOUDWATCH_LOGS_SOURCE.js';
import type { CloudWatchLogsTelemetry } from './CloudWatchLogsTelemetry.js';
import type { CloudWatchLogsTelemetryQueryExecution } from './CloudWatchLogsTelemetryQueryExecution.js';
import type { RunbookTelemetry } from './RunbookTelemetry.js';

/**
 * The telemetry of an execution: the CloudWatch Logs queries of every step and level read, their total statistics
 * and the reads that failed, which have no statistics. It is the `telemetry` of `buildRunbookOutput`, available
 * without building the whole output.
 *
 * Complexity: O(S) over the traced steps.
 *
 * @param trace - The trace of the execution (`result.trace`)
 * @returns The telemetry, or nothing when no step queried CloudWatch Logs
 *
 * @example
 * ```typescript
 * const total = buildRunbookTelemetry(result.trace)?.cloudWatchLogs.statistics;
 * ```
 */
export function buildRunbookTelemetry(
  trace: Pick<RunbookExecutionTrace, 'pipeline' | 'readFailures'>,
): RunbookTelemetry | undefined {
  const cloudWatchLogs = buildCloudWatchLogsTelemetry(
    trace.pipeline,
    trace.readFailures?.[CLOUDWATCH_LOGS_SOURCE] ?? 0,
  );
  return cloudWatchLogs === undefined ? undefined : { cloudWatchLogs };
}

function buildCloudWatchLogsTelemetry(
  steps: ReadonlyArray<StepTrace>,
  failedQueryCount: number,
): CloudWatchLogsTelemetry | undefined {
  const queryExecutions: CloudWatchLogsTelemetryQueryExecution[] = [];
  const statistics: AWSCloudWatchLogsQueryStatistics[] = [];

  for (const step of steps) {
    const diagnostics = step.diagnostics?.cloudWatchLogs;
    if (diagnostics === undefined) continue;

    statistics.push(diagnostics.statistics);
    for (const execution of diagnostics.queryExecutions) {
      queryExecutions.push({
        stepId: step.stepId,
        stepLabel: step.label,
        executionOrder: step.executionOrder,
        queryId: execution.queryId,
        profile: execution.profile,
        logGroups: execution.logGroups,
        statistics: execution.statistics,
      });
    }
  }

  if (statistics.length === 0 && failedQueryCount === 0) {
    return undefined;
  }

  return {
    queryCount: queryExecutions.length,
    ...(failedQueryCount > 0 ? { failedQueryCount } : {}),
    statistics: sumCloudWatchLogsQueryStatistics(statistics),
    queryExecutions,
  };
}
