import type { ResultField } from '@go-automation/go-common/aws';

import type { Step } from '../../../types/Step.js';
import type { StepKind } from '../../../types/StepKind.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { StepResult } from '../../../types/StepResult.js';
import type { TimeRangeFromParams } from '../../../steps/data/TimeRangeFromParams.js';
import { resolveTimeRange } from '../../../steps/data/resolveTimeRange.js';
import { executeStep } from '../../../steps/data/executeStep.js';
import { executeCloudWatchLogsQuery } from '../../../steps/data/executeCloudWatchLogsQuery.js';
import type { ExecutedCloudWatchLogsQuery } from '../../../steps/data/executeCloudWatchLogsQuery.js';
import { DEFAULT_LAMBDA_ERROR_QUERY } from '../../../lambda/queries/DEFAULT_LAMBDA_ERROR_QUERY.js';
import { scanLambdaLogs } from '../../../lambda/helpers/scanLambdaLogs.js';
import { LambdaReporter } from '../../../lambda/reporting/LambdaReporter.js';

import {
  VERSIONING_LAMBDA_ERROR_COUNT_VAR,
  VERSIONING_LAMBDA_ERROR_MESSAGE_VAR,
  VERSIONING_LAMBDA_PROBE_STATE_VAR,
  VERSIONING_LAMBDA_UNAVAILABLE_REASON_VAR,
  type VersioningLambdaProbeState,
} from './versioningLambdaProbe.js';

type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;

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
export class QueryVersioningLambdaErrorsStep implements Step<Rows> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly lambdaLogGroup: string;
  private readonly timeRangeFromParams: TimeRangeFromParams;

  constructor(config: QueryVersioningLambdaErrorsConfig) {
    this.id = config.id;
    this.label = config.label;
    this.lambdaLogGroup = config.lambdaLogGroup;
    this.timeRangeFromParams = config.timeRangeFromParams;
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    return {
      queryKind: 'lambda-error-probe',
      identifierMode: context.vars.get('apiGwCurrentQueryIdentifierMode') ?? 'none',
      query: DEFAULT_LAMBDA_ERROR_QUERY,
      logGroups: [this.lambdaLogGroup],
      timeRange: {
        start: context.params.get(this.timeRangeFromParams.start) ?? null,
        end: context.params.get(this.timeRangeFromParams.end) ?? null,
      },
    };
  }

  async execute(context: RunbookContext): Promise<StepResult<Rows>> {
    return executeStep('Versioning Lambda error query', async () => {
      if (!shouldQueryVersioningLambda(context)) {
        return {
          success: true,
          output: [],
          vars: probeVars('skipped'),
          // Nothing was corroborated: let the traversal decide.
          next: 'continue' as const,
        };
      }

      const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
      let queryResult: ExecutedCloudWatchLogsQuery;
      try {
        queryResult = await executeCloudWatchLogsQuery(
          context,
          [this.lambdaLogGroup],
          DEFAULT_LAMBDA_ERROR_QUERY,
          timeRange,
          {
            ...(context.signal !== undefined ? { signal: context.signal } : {}),
            logGroupResolutionMode: 'search-configured-profiles',
          },
        );
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        new LambdaReporter(context.services.reporter).queryFailed([this.lambdaLogGroup], reason);
        return {
          success: true,
          output: [],
          vars: probeVars('unavailable', { unavailableReason: reason }),
          // A failed query is not evidence of zero errors: keep traversing.
          next: 'continue' as const,
        };
      }

      const scan = scanLambdaLogs(queryResult.rows);
      context.services.reporter.add({
        label: `Lambda versioning: ${String(queryResult.rows.length)} errori nella finestra`,
      });

      return {
        success: true,
        output: queryResult.rows,
        vars: probeVars('queried', {
          errorCount: queryResult.rows.length,
          errorMessage: scan?.message ?? '',
        }),
        ...(queryResult.diagnostics !== undefined ? { diagnostics: queryResult.diagnostics } : {}),
        // The corroborating evidence is in: try to close the case here and skip
        // a traversal that would scan gigabytes for nothing. When no case
        // matches the engine simply carries on.
        next: 'resolve' as const,
      };
    });
  }
}

/**
 * The probe runs on the shape it was built for: an API Gateway 500 with no
 * pn-delivery error.
 *
 * It deliberately does **not** require a query identifier. Those occurrences
 * carry no trace id precisely because nothing logged an error — which is the
 * very situation the probe exists to corroborate — and gating on one made the
 * documented case unmatchable in production.
 */
function shouldQueryVersioningLambda(context: RunbookContext): boolean {
  return (
    (context.vars.get('apiGwStatusCode') ?? '').trim() === '500' &&
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

/** Creates the runbook-local corroborating Lambda probe. */
