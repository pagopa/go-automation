import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { MetricDatapoint, MetricDimension } from '../../services/CloudWatchMetricsService.js';
import type { TimeRangeFromParams } from './CloudWatchLogsQueryStep.js';
import { interpolateTemplate } from './interpolateTemplate.js';

/**
 * Configuration for the CloudWatch Metrics data step.
 */
export interface CloudWatchMetricsConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** CloudWatch namespace (e.g. 'AWS/ApiGateway') */
  readonly namespace: string;
  /** Metric name (e.g. '5XXError') */
  readonly metricName: string;
  /** Metric dimensions (supports {{params.xxx}} and {{vars.xxx}} in values) */
  readonly dimensions: ReadonlyArray<MetricDimension>;
  /** Aggregation period in seconds (default 300) */
  readonly periodSeconds?: number;
  /** Statistic to retrieve (default 'Sum') */
  readonly stat?: string;
  /** Parameter names to resolve start/end dates from context.params */
  readonly timeRangeFromParams: TimeRangeFromParams;
}

/**
 * Data step that retrieves CloudWatch metric datapoints.
 * Resolves the time range from context parameters and interpolates template variables in dimension values.
 *
 * @example
 * ```typescript
 * const step = getCloudWatchMetrics({
 *   id: 'fetch-errors',
 *   label: 'Fetch 5XX errors',
 *   namespace: 'AWS/ApiGateway',
 *   metricName: '5XXError',
 *   dimensions: [{ name: 'ApiName', value: '{{params.apiName}}' }],
 *   timeRangeFromParams: { start: 'startDate', end: 'endDate' },
 * });
 * ```
 */
export class CloudWatchMetricsStep implements Step<ReadonlyArray<MetricDatapoint>> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly namespace: string;
  private readonly metricName: string;
  private readonly dimensions: ReadonlyArray<MetricDimension>;
  private readonly periodSeconds: number;
  private readonly stat: string;
  private readonly timeRangeFromParams: TimeRangeFromParams;

  constructor(config: CloudWatchMetricsConfig) {
    this.id = config.id;
    this.label = config.label;
    this.namespace = config.namespace;
    this.metricName = config.metricName;
    this.dimensions = config.dimensions;
    this.periodSeconds = config.periodSeconds ?? 300;
    this.stat = config.stat ?? 'Sum';
    this.timeRangeFromParams = config.timeRangeFromParams;
  }

  /**
   * Returns resolved CloudWatch Metrics configuration for the execution trace.
   *
   * @param context - The runbook execution context
   * @returns Trace info with namespace, metric name, dimensions, period, stat, and time range
   */
  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    const startStr = context.params.get(this.timeRangeFromParams.start);
    const endStr = context.params.get(this.timeRangeFromParams.end);

    return {
      namespace: this.namespace,
      metricName: this.metricName,
      dimensions: resolveDimensions(this.dimensions, context),
      periodSeconds: this.periodSeconds,
      stat: this.stat,
      timeRange: { start: startStr ?? null, end: endStr ?? null },
    };
  }

  /**
   * Retrieves metric datapoints from CloudWatch Metrics.
   *
   * @param context - The runbook execution context
   * @returns Step result containing an array of metric datapoints
   */
  async execute(context: RunbookContext): Promise<StepResult<ReadonlyArray<MetricDatapoint>>> {
    try {
      const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
      const resolvedDimensions = resolveDimensions(this.dimensions, context);

      const results = await context.services.cloudWatchMetrics.getMetricData(
        this.namespace,
        this.metricName,
        resolvedDimensions,
        timeRange,
        this.periodSeconds,
        this.stat,
      );

      return { success: true, output: results };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `CloudWatch Metrics query failed: ${message}` };
    }
  }
}

/**
 * Resolves a TimeRange from context parameters using the configured parameter names.
 */
function resolveTimeRange(
  context: RunbookContext,
  config: TimeRangeFromParams,
): { readonly start: Date; readonly end: Date } {
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
 * Resolves template placeholders in dimension values.
 */
function resolveDimensions(
  dimensions: ReadonlyArray<MetricDimension>,
  context: RunbookContext,
): ReadonlyArray<MetricDimension> {
  return dimensions.map((dim) => ({
    name: dim.name,
    value: interpolateTemplate(dim.value, context),
  }));
}

/**
 * Factory function for creating a CloudWatch Metrics data step.
 *
 * @param config - Step configuration
 * @returns A new CloudWatchMetricsStep instance
 */
export function getCloudWatchMetrics(config: CloudWatchMetricsConfig): CloudWatchMetricsStep {
  return new CloudWatchMetricsStep(config);
}
