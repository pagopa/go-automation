import type { ResultField } from '@go-automation/go-common/aws';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';
import type { TimeRangeFromParams } from '../../steps/data/TimeRangeFromParams.js';
import { interpolatePlaceholders } from '../../core/templatePlaceholders.js';
import { resolveTimeRange } from '../../steps/data/resolveTimeRange.js';
import { executeStep } from '../../steps/data/executeStep.js';
import { executeCloudWatchLogsQuery } from '../../steps/data/executeCloudWatchLogsQuery.js';
import { LambdaReporter } from '../reporting/LambdaReporter.js';

type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;

/**
 * Configuration for {@link QueryLambdaInvocationStep}.
 */
export interface QueryLambdaInvocationConfig {
  readonly id: string;
  readonly label: string;
  readonly lambdaLogGroup: string;
  /** Query template filtered by `{{vars.lambdaRequestId}}`. */
  readonly queryTemplate: string;
  readonly timeRangeFromParams: TimeRangeFromParams;
}

/**
 * Reconstructs the full Lambda invocation flow for the extracted `requestId`
 * (same log group, sorted ascending). No-ops when no requestId is available.
 * Its rows are stored as step output so runbook known cases can match on
 * `steps.<id>`.
 */
export class QueryLambdaInvocationStep implements Step<Rows> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly lambdaLogGroup: string;
  private readonly queryTemplate: string;
  private readonly timeRangeFromParams: TimeRangeFromParams;

  constructor(config: QueryLambdaInvocationConfig) {
    this.id = config.id;
    this.label = config.label;
    this.lambdaLogGroup = config.lambdaLogGroup;
    this.queryTemplate = config.queryTemplate;
    this.timeRangeFromParams = config.timeRangeFromParams;
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    return {
      query: interpolatePlaceholders(this.queryTemplate, context),
      logGroups: [this.lambdaLogGroup],
      queryKind: 'lambda-invocation-flow',
    };
  }

  async execute(context: RunbookContext): Promise<StepResult<Rows>> {
    const requestId = (context.vars.get('lambdaRequestId') ?? '').trim();
    if (requestId === '') {
      // No requestId extracted: nothing to reconstruct, skip the query.
      return { success: true, vars: { lambdaInvocationLogCount: '0' } };
    }

    return executeStep('Lambda invocation query', async () => {
      const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
      const query = interpolatePlaceholders(this.queryTemplate, context);
      const result = await executeCloudWatchLogsQuery(context, [this.lambdaLogGroup], query, timeRange, {
        ...(context.signal !== undefined ? { signal: context.signal } : {}),
        logGroupResolutionMode: 'search-configured-profiles',
      });
      if (context.logger !== undefined) {
        new LambdaReporter(context.logger).invocation(requestId, result.rows.length);
      }
      return {
        success: true,
        output: result.rows,
        vars: { lambdaInvocationLogCount: String(result.rows.length) },
        ...(result.diagnostics !== undefined ? { diagnostics: result.diagnostics } : {}),
      };
    });
  }
}
