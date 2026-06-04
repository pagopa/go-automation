import type { ResultField } from '@go-automation/go-common/aws';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';
import type { TimeRangeFromParams } from '../../steps/data/CloudWatchLogsQueryStep.js';
import { interpolatePlaceholders } from '../../core/templatePlaceholders.js';
import { resolveTimeRange } from '../../steps/data/resolveTimeRange.js';
import { executeStep } from '../../steps/data/executeStep.js';
import { executeCloudWatchLogsQuery } from '../../steps/data/executeCloudWatchLogsQuery.js';
import type { LambdaDownstream } from '../types/LambdaDownstream.js';
import { scanLambdaLogs } from '../helpers/scanLambdaLogs.js';
import { LambdaReporter } from '../reporting/LambdaReporter.js';

type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;

/**
 * Configuration for {@link QueryDownstreamLogsStep}.
 */
export interface QueryDownstreamLogsConfig {
  readonly id: string;
  readonly label: string;
  readonly downstream: LambdaDownstream;
  /** Query template filtered by `{{vars.lambdaRequestId}}`. */
  readonly queryTemplate: string;
  readonly timeRangeFromParams: TimeRangeFromParams;
}

/**
 * Queries a downstream microservice log group by the Lambda `requestId` when
 * the parse step routed to it. No-ops otherwise (wrong target, no log group,
 * or no requestId). Flat (no recursion), mirroring the dynamic per-service
 * visit of the API Gateway pipeline.
 */
export class QueryDownstreamLogsStep implements Step<Rows> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly downstream: LambdaDownstream;
  private readonly queryTemplate: string;
  private readonly timeRangeFromParams: TimeRangeFromParams;

  constructor(config: QueryDownstreamLogsConfig) {
    this.id = config.id;
    this.label = config.label;
    this.downstream = config.downstream;
    this.queryTemplate = config.queryTemplate;
    this.timeRangeFromParams = config.timeRangeFromParams;
  }

  async execute(context: RunbookContext): Promise<StepResult<Rows>> {
    const target = (context.vars.get('lambdaDownstreamTarget') ?? '').trim();
    const requestId = (context.vars.get('lambdaRequestId') ?? '').trim();
    const logGroup = this.downstream.logGroup;

    // Only query when this downstream is the routed target, has a log group,
    // and a requestId is available to correlate on.
    if (target !== this.downstream.name || logGroup === undefined || requestId === '') {
      return { success: true };
    }

    return executeStep('Lambda downstream query', async () => {
      const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
      const query = interpolatePlaceholders(this.queryTemplate, context);
      const result = await executeCloudWatchLogsQuery(context, [logGroup], query, timeRange, {
        ...(context.signal !== undefined ? { signal: context.signal } : {}),
        logGroupResolutionMode: 'search-configured-profiles',
      });

      const representative = scanLambdaLogs(result.rows)?.message ?? '';
      if (context.logger !== undefined) {
        new LambdaReporter(context.logger).downstream(this.downstream.name, logGroup, result.rows.length);
      }

      const vars: Record<string, string> = {
        [`${this.downstream.varPrefix}LogCount`]: String(result.rows.length),
      };
      if (representative !== '') {
        vars[`${this.downstream.varPrefix}ErrorMsg`] = representative;
        vars['lastErrorMsg'] = representative;
      }

      return {
        success: true,
        output: result.rows,
        vars,
        ...(result.diagnostics !== undefined ? { diagnostics: result.diagnostics } : {}),
      };
    });
  }
}
