import {
  executeStep,
  type RunbookContext,
  type Step,
  type StepKind,
  type StepResult,
} from '../../../../engine/index.js';
import {
  boundedText,
  DEFAULT_LAMBDA_ERROR_QUERY,
  LambdaReporter,
  resolveTimeRange,
  scanLambdaLogs,
  SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS,
  tryCloudWatchLogsRead,
  type TimeRangeFromParams,
  OperationalStep,
  type OperationalContext,
  type OperationalServiceName,
  type CloudWatchLogsRows,
} from '../../../../toolkits/send/index.js';

import {
  VERSIONING_LAMBDA_ERROR_COUNT_VAR,
  VERSIONING_LAMBDA_ERROR_MESSAGE_VAR,
  VERSIONING_LAMBDA_PROBE_STATE_VAR,
  VERSIONING_LAMBDA_UNAVAILABLE_REASON_VAR,
  type VersioningLambdaProbeState,
} from './versioningLambdaProbe.js';

export interface QueryVersioningLambdaErrorsConfig {
  readonly id: string;
  readonly label: string;
  readonly lambdaLogGroup: string;
  readonly timeRangeFromParams: TimeRangeFromParams;
}

/**
 * Corroborating probe for the documented API Gateway 500 case where neither
 * pn-delivery nor the versioning Lambda contains an application error.
 *
 * The probe deliberately models `queried` and `unavailable` as different
 * states: a failed CloudWatch query must never be interpreted as zero errors.
 */
export class QueryVersioningLambdaErrorsStep
  extends OperationalStep<CloudWatchLogsRows>
  implements Step<CloudWatchLogsRows>
{
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly lambdaLogGroup: string;
  private readonly timeRangeFromParams: TimeRangeFromParams;

  constructor(config: QueryVersioningLambdaErrorsConfig) {
    super();
    this.id = config.id;
    this.label = config.label;
    this.lambdaLogGroup = config.lambdaLogGroup;
    this.timeRangeFromParams = config.timeRangeFromParams;
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    return {
      queryKind: 'lambda-error-probe',
      query: DEFAULT_LAMBDA_ERROR_QUERY,
      logGroups: [this.lambdaLogGroup],
      timeRange: {
        start: context.params.get(this.timeRangeFromParams.start) ?? null,
        end: context.params.get(this.timeRangeFromParams.end) ?? null,
      },
    };
  }

  /**
   * Operational services this step uses.
   *
   * @returns The required service names
   */
  override requiredServices(): ReadonlyArray<OperationalServiceName> {
    return ['cloudWatchLogs'];
  }

  override async execute(context: OperationalContext): Promise<StepResult<CloudWatchLogsRows>> {
    return executeStep(context, 'Versioning Lambda error query', async () => {
      if (!shouldQueryVersioningLambda(context)) {
        return {
          success: true,
          output: [],
          vars: probeVars('skipped'),
          // Nothing was corroborated: let the traversal decide.
          next: 'continue' as const,
        };
      }

      // One read for the whole execution: every request that needs the probe shares it, with its coverage; only the
      // first declares the telemetry.
      const key = `window-read:${this.id}`;
      const shared = context.sharedReads?.get(key) as Promise<StepResult<CloudWatchLogsRows>> | undefined;
      if (shared !== undefined) {
        const { diagnostics: _measured, ...result } = await shared;
        return result;
      }
      const read = this.probe(context);
      context.sharedReads?.set(key, read);
      return read;
    });
  }

  /** Reads the errors of the versioning Lambda in the window. */
  private async probe(context: OperationalContext): Promise<StepResult<CloudWatchLogsRows>> {
    const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
    const queryResult = await tryCloudWatchLogsRead(context, {
      logGroups: [this.lambdaLogGroup],
      query: DEFAULT_LAMBDA_ERROR_QUERY,
      timeRange,
      options: SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS,
    });
    if (queryResult.failure !== undefined) {
      const reason = queryResult.failure.message;
      new LambdaReporter(context.services.reporter).queryFailed([this.lambdaLogGroup], reason);
      return {
        success: true,
        output: [],
        vars: probeVars('unavailable', { unavailableReason: reason }),
        coverage: queryResult.coverage,
        // A failed query is not evidence of zero errors: keep traversing.
        next: 'continue' as const,
      };
    }

    const scan = scanLambdaLogs(queryResult.rows, []); // message only: the category is not read here
    context.services.reporter.add({
      label: `Lambda versioning: ${String(queryResult.rows.length)} errori nella finestra`,
    });

    return {
      success: true,
      output: queryResult.rows,
      // A partial read keeps its rows (positive evidence) but is not `queried`: zero errors would not be proven.
      vars: probeVars(queryResult.coverage.length === 0 ? 'queried' : 'saturated', {
        errorCount: queryResult.rows.length,
        errorMessage: boundedText(scan?.message ?? ''),
      }),
      ...(queryResult.diagnostics !== undefined ? { diagnostics: queryResult.diagnostics } : {}),
      ...(queryResult.coverage.length > 0 ? { coverage: queryResult.coverage } : {}),
    };
  }
}

/**
 * The probe runs on the shape it was built for: an API Gateway 500 whose complete pn-delivery read found no
 * error.
 *
 * It deliberately does **not** require a query identifier. Those occurrences
 * carry no trace id precisely because nothing logged an error — which is the
 * very situation the probe exists to corroborate — and gating on one made the
 * documented case unmatchable in production.
 */
function shouldQueryVersioningLambda(context: RunbookContext): boolean {
  return (
    (context.vars.get('apiGwStatusCode') ?? '').trim() === '500' &&
    (context.vars.get('deliveryLookupState') ?? '').trim() === 'queried' &&
    (context.vars.get('deliveryLogCount') ?? '').trim() === '0'
  );
}

function probeVars(
  state: VersioningLambdaProbeState,
  values: { readonly errorCount?: number; readonly errorMessage?: string; readonly unavailableReason?: string } = {},
): Readonly<Record<string, string>> {
  return {
    [VERSIONING_LAMBDA_PROBE_STATE_VAR]: state,
    [VERSIONING_LAMBDA_ERROR_COUNT_VAR]: values.errorCount === undefined ? '' : String(values.errorCount),
    [VERSIONING_LAMBDA_ERROR_MESSAGE_VAR]: values.errorMessage ?? '',
    [VERSIONING_LAMBDA_UNAVAILABLE_REASON_VAR]: values.unavailableReason ?? '',
  };
}
