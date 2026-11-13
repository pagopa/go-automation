import type {
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryResult,
} from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { RunbookContext } from '../../../../engine/types/RunbookContext.js';
import type { Step } from '../../../../engine/types/Step.js';
import type { StepKind } from '../../../../engine/types/StepKind.js';
import type { StepResult } from '../../../../engine/types/StepResult.js';
import type { StepDiagnostics } from '../../../../engine/tracing/StepDiagnostics.js';
import type { TimeRangeFromParams } from '../../../common/time/TimeRangeFromParams.js';
import { resolveTimeRange } from '../../../common/time/resolveTimeRange.js';
import type { BuildInteropK8sApplicationLogsQueryFn } from '../types/BuildInteropK8sApplicationLogsQueryFn.js';

export interface QueryInteropApplicationLogsStepConfig {
  readonly id: string;
  readonly label: string;
  readonly timeRangeFromParams: TimeRangeFromParams;
  readonly logGroupVar?: string;
  readonly podAppVar?: string;
  readonly environmentVar?: string;
  /** Trace profile id of the query (from the product profile). */
  readonly queryProfileId: string;
  /** Query builder (from the product profile). */
  readonly buildQuery: BuildInteropK8sApplicationLogsQueryFn;
}

const DEFAULT_LOG_GROUP_VAR = 'interopLogGroup';
const DEFAULT_POD_APP_VAR = 'interopPodApp';
const DEFAULT_ENVIRONMENT_VAR = 'interopEnvironment';

export class QueryInteropApplicationLogsStep implements Step<ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly timeRangeFromParams: TimeRangeFromParams;
  private readonly logGroupVar: string;
  private readonly podAppVar: string;
  private readonly environmentVar: string;
  private readonly queryProfileId: string;
  private readonly buildQuery: BuildInteropK8sApplicationLogsQueryFn;

  constructor(config: QueryInteropApplicationLogsStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.timeRangeFromParams = config.timeRangeFromParams;
    this.logGroupVar = config.logGroupVar ?? DEFAULT_LOG_GROUP_VAR;
    this.podAppVar = config.podAppVar ?? DEFAULT_POD_APP_VAR;
    this.environmentVar = config.environmentVar ?? DEFAULT_ENVIRONMENT_VAR;
    this.queryProfileId = config.queryProfileId;
    this.buildQuery = config.buildQuery;
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    const logGroup = context.vars.get(this.logGroupVar);
    const podApp = context.vars.get(this.podAppVar);
    return {
      queryProfileId: this.queryProfileId,
      queryKind: 'interop-application-error-scan',
      query: podApp === undefined ? '' : this.buildQuery(podApp),
      logGroups: logGroup === undefined ? [] : [logGroup],
      identifiers: { podApp: podApp ?? null, environment: context.vars.get(this.environmentVar) ?? null },
      timeRange: {
        start: context.params.get(this.timeRangeFromParams.start) ?? null,
        end: context.params.get(this.timeRangeFromParams.end) ?? null,
      },
    };
  }

  async execute(context: RunbookContext): Promise<StepResult<ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>>> {
    const logGroup = readRequiredVar(context, this.logGroupVar);
    if (logGroup === undefined) return missingVarFailure(this.logGroupVar);
    const podApp = readRequiredVar(context, this.podAppVar);
    if (podApp === undefined) return missingVarFailure(this.podAppVar);

    const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
    const query = this.buildQuery(podApp);
    const options = buildQueryOptions(context);

    context.services.reporter.add({ label: `Query log applicativi INTEROP [pod_app=${podApp}]` });
    const result = await context.services.cloudWatchLogs.queryWithStatistics([logGroup], query, timeRange, options);
    context.services.reporter.add({ label: `Log applicativi trovati: ${result.rows.length}` });

    return {
      success: true,
      output: result.rows,
      diagnostics: toStepDiagnostics(result),
    };
  }
}

function readRequiredVar(context: RunbookContext, key: string): string | undefined {
  const value = context.vars.get(key)?.trim();
  return value === undefined || value === '' ? undefined : value;
}

function missingVarFailure(key: string): StepResult<never> {
  return { success: false, error: `Missing required runbook variable: ${key}` };
}

function buildQueryOptions(context: RunbookContext): AWSCloudWatchLogsQueryOptions {
  return {
    ...(context.signal === undefined ? {} : { signal: context.signal }),
    logGroupResolutionMode: 'search-configured-profiles',
  };
}

function toStepDiagnostics(result: AWSCloudWatchLogsQueryResult): StepDiagnostics {
  return {
    cloudWatchLogs: {
      rowsReturned: result.rows.length,
      statistics: result.statistics,
      queryExecutions: result.queryExecutions,
    },
  };
}
