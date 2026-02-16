import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { TimeRange } from '../../types/TimeRange.js';
import { interpolateTemplate } from './interpolateTemplate.js';

/**
 * Configuration for mapping time range boundaries to context parameter names.
 */
export interface TimeRangeFromParams {
  /** Parameter name containing the ISO start date */
  readonly start: string;
  /** Parameter name containing the ISO end date */
  readonly end: string;
}

/**
 * Configuration for the CloudWatch Logs Insights query step.
 */
export interface CloudWatchLogsQueryConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** Log group names to query */
  readonly logGroups: ReadonlyArray<string>;
  /** CloudWatch Logs Insights query string (supports {{params.xxx}} and {{vars.xxx}} templates) */
  readonly query: string;
  /** Parameter names to resolve start/end dates from context.params */
  readonly timeRangeFromParams: TimeRangeFromParams;
}

/**
 * Data step that executes a CloudWatch Logs Insights query.
 * Resolves the time range from context parameters and interpolates template variables in the query.
 *
 * @example
 * ```typescript
 * const step = queryCloudWatchLogs({
 *   id: 'fetch-errors',
 *   label: 'Fetch error logs',
 *   logGroups: ['/aws/lambda/my-function'],
 *   query: 'fields @timestamp, @message | filter @message like /{{vars.errorPattern}}/',
 *   timeRangeFromParams: { start: 'startDate', end: 'endDate' },
 * });
 * ```
 */
export class CloudWatchLogsQueryStep implements Step<ReadonlyArray<ReadonlyArray<ResultField>>> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly logGroups: ReadonlyArray<string>;
  private readonly query: string;
  private readonly timeRangeFromParams: TimeRangeFromParams;

  constructor(config: CloudWatchLogsQueryConfig) {
    this.id = config.id;
    this.label = config.label;
    this.logGroups = config.logGroups;
    this.query = config.query;
    this.timeRangeFromParams = config.timeRangeFromParams;
  }

  /**
   * Executes the CloudWatch Logs Insights query against the configured log groups.
   *
   * @param context - The runbook execution context
   * @returns Step result containing an array of result rows
   */
  async execute(context: RunbookContext): Promise<StepResult<ReadonlyArray<ReadonlyArray<ResultField>>>> {
    try {
      const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
      const interpolatedQuery = interpolateTemplate(this.query, context);

      const results = await context.services.cloudWatchLogs.query(this.logGroups, interpolatedQuery, timeRange);

      return { success: true, output: results };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `CloudWatch Logs query failed: ${message}` };
    }
  }
}

/**
 * Resolves a TimeRange from context parameters using the configured parameter names.
 *
 * @param context - The runbook execution context
 * @param config - Configuration mapping parameter names to start/end
 * @returns Resolved TimeRange with parsed Date objects
 */
function resolveTimeRange(context: RunbookContext, config: TimeRangeFromParams): TimeRange {
  const startStr = context.params.get(config.start);
  const endStr = context.params.get(config.end);

  if (startStr === undefined) {
    throw new Error(`Missing required parameter '${config.start}' for time range start`);
  }
  if (endStr === undefined) {
    throw new Error(`Missing required parameter '${config.end}' for time range end`);
  }

  const start = new Date(startStr);
  const end = new Date(endStr);

  if (Number.isNaN(start.getTime())) {
    throw new Error(`Invalid ISO date for parameter '${config.start}': ${startStr}`);
  }
  if (Number.isNaN(end.getTime())) {
    throw new Error(`Invalid ISO date for parameter '${config.end}': ${endStr}`);
  }

  return { start, end };
}

/**
 * Factory function for creating a CloudWatch Logs Insights query step.
 *
 * @param config - Step configuration
 * @returns A new CloudWatchLogsQueryStep instance
 */
export function queryCloudWatchLogs(config: CloudWatchLogsQueryConfig): CloudWatchLogsQueryStep {
  return new CloudWatchLogsQueryStep(config);
}
