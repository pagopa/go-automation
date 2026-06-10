import type { ResultField } from '@go-automation/go-common/aws';
import type { AWSCloudWatchLogsLogGroupResolutionMode } from '@go-automation/go-common/aws';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { TimeRangeFromParams } from './TimeRangeFromParams.js';
import { interpolatePlaceholders } from '../../core/templatePlaceholders.js';
import { resolveTimeRange } from './resolveTimeRange.js';
import { executeStep } from './executeStep.js';
import { executeCloudWatchLogsQuery } from './executeCloudWatchLogsQuery.js';

export type { TimeRangeFromParams } from './TimeRangeFromParams.js';

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
  /**
   * Metadati arbitrari aggiunti al payload di `getTraceInfo`. Lo spread
   * avviene PRIMA dei campi canonici (`query`, `logGroups`, `timeRange`)
   * così le chiavi riservate non possono essere sovrascritte
   * accidentalmente.
   *
   * Usato dai builder del modulo `apigw` per propagare i metadata
   * cross-prodotto (`queryProfileId`, `queryKind`, `identifierMode`) anche
   * agli step costruiti via questa factory generica.
   */
  readonly traceMetadata?: Readonly<Record<string, unknown>>;
  /**
   * Strategia di risoluzione del log group passata al servizio
   * CloudWatch Logs. Quando assente, il servizio applica il proprio
   * default (`'default-profile-only'`).
   */
  readonly logGroupResolutionMode?: AWSCloudWatchLogsLogGroupResolutionMode;
  /**
   * Abilita la paginazione dei risultati CloudWatch Logs Insights per
   * questo step. Default `false`.
   */
  readonly paginateResults?: boolean;
}

/**
 * Data step that executes a CloudWatch Logs Insights query.
 * Resolves the time range from context parameters and interpolates template variables in the query.
 *
 * @example
 * ```typescript
 * const step = new CloudWatchLogsQueryStep({
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
  private readonly traceMetadata: Readonly<Record<string, unknown>> | undefined;
  private readonly logGroupResolutionMode: AWSCloudWatchLogsLogGroupResolutionMode | undefined;
  private readonly paginateResults: boolean | undefined;

  constructor(config: CloudWatchLogsQueryConfig) {
    this.id = config.id;
    this.label = config.label;
    this.logGroups = config.logGroups;
    this.query = config.query;
    this.timeRangeFromParams = config.timeRangeFromParams;
    this.traceMetadata = config.traceMetadata;
    this.logGroupResolutionMode = config.logGroupResolutionMode;
    this.paginateResults = config.paginateResults;
  }

  /**
   * Returns resolved query and log group configuration for the execution trace.
   *
   * @param context - The runbook execution context
   * @returns Trace info with resolved query, log groups, and time range
   */
  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    const interpolatedQuery = interpolatePlaceholders(this.query, context);
    const startStr = context.params.get(this.timeRangeFromParams.start);
    const endStr = context.params.get(this.timeRangeFromParams.end);

    // `traceMetadata` viene spread PRIMA dei campi canonici (`query`,
    // `logGroups`, `timeRange`) così le chiavi riservate non possono
    // essere sovrascritte accidentalmente da un metadata mal-formato.
    return {
      ...(this.traceMetadata ?? {}),
      query: interpolatedQuery,
      logGroups: [...this.logGroups],
      timeRange: { start: startStr ?? null, end: endStr ?? null },
    };
  }

  /**
   * Executes the CloudWatch Logs Insights query against the configured log groups.
   *
   * @param context - The runbook execution context
   * @returns Step result containing an array of result rows
   */
  async execute(context: RunbookContext): Promise<StepResult<ReadonlyArray<ReadonlyArray<ResultField>>>> {
    return executeStep('CloudWatch Logs query', async () => {
      const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
      const interpolatedQuery = interpolatePlaceholders(this.query, context);

      const result = await executeCloudWatchLogsQuery(context, this.logGroups, interpolatedQuery, timeRange, {
        ...(context.signal !== undefined ? { signal: context.signal } : {}),
        ...(this.logGroupResolutionMode !== undefined ? { logGroupResolutionMode: this.logGroupResolutionMode } : {}),
        ...(this.paginateResults !== undefined ? { paginateResults: this.paginateResults } : {}),
      });

      return {
        success: true,
        output: result.rows,
        ...(result.diagnostics !== undefined ? { diagnostics: result.diagnostics } : {}),
      };
    });
  }
}
