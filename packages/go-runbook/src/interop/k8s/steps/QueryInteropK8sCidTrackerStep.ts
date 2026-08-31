import { sumCloudWatchLogsQueryStatistics } from '@go-automation/go-common/aws';
import type {
  AWSCloudWatchLogsQueryExecution,
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryStatistics,
  ResultField,
} from '@go-automation/go-common/aws';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepKind } from '../../../types/StepKind.js';
import type { StepResult } from '../../../types/StepResult.js';
import type { StepDiagnostics } from '../../../trace/StepDiagnostics.js';
import type { TimeRangeFromParams } from '../../../steps/data/TimeRangeFromParams.js';
import { resolveTimeRange } from '../../../steps/data/resolveTimeRange.js';
import { INTEROP_K8S_QUERY_PROFILE } from '../profiles/INTEROP_K8S_QUERY_PROFILE.js';
import type { BuildInteropK8sCidTrackerQueryFn } from '../profiles/InteropK8sQueryProfile.js';
import type { InteropK8sApplicationLogAnalysis } from './AnalyzeInteropK8sApplicationLogsStep.js';

export interface InteropK8sCidTrackerResult {
  readonly cid: string;
  readonly rows: ReadonlyArray<ReadonlyArray<ResultField>>;
}

export interface QueryInteropK8sCidTrackerStepConfig {
  readonly id: string;
  readonly label: string;
  readonly fromStep: string;
  readonly timeRangeFromParams: TimeRangeFromParams;
  readonly logGroupVar?: string;
  readonly varPrefix?: string;
  readonly queryProfileId?: string;
  readonly buildQuery?: BuildInteropK8sCidTrackerQueryFn;
}

const DEFAULT_LOG_GROUP_VAR = 'interopLogGroup';
const DEFAULT_VAR_PREFIX = 'interopCidTracker';

export class QueryInteropK8sCidTrackerStep implements Step<ReadonlyArray<InteropK8sCidTrackerResult>> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly fromStep: string;
  private readonly timeRangeFromParams: TimeRangeFromParams;
  private readonly logGroupVar: string;
  private readonly varPrefix: string;
  private readonly queryProfileId: string;
  private readonly buildQuery: BuildInteropK8sCidTrackerQueryFn;

  constructor(config: QueryInteropK8sCidTrackerStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.timeRangeFromParams = config.timeRangeFromParams;
    this.logGroupVar = config.logGroupVar ?? DEFAULT_LOG_GROUP_VAR;
    this.varPrefix = config.varPrefix ?? DEFAULT_VAR_PREFIX;
    this.queryProfileId = config.queryProfileId ?? INTEROP_K8S_QUERY_PROFILE.cidTrackerQueryProfileId;
    this.buildQuery = config.buildQuery ?? INTEROP_K8S_QUERY_PROFILE.buildCidTrackerQuery;
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    const logGroup = context.vars.get(this.logGroupVar);
    const analysis = readApplicationAnalysis(context, this.fromStep);
    const cids = analysis?.cids ?? [];
    return {
      queryProfileId: this.queryProfileId,
      queryKind: 'interop-cid-tracker',
      logGroups: logGroup === undefined ? [] : [logGroup],
      identifiers: { cids },
      queries: cids.map((cid) => ({ cid, query: this.buildQuery(cid) })),
      timeRange: {
        start: context.params.get(this.timeRangeFromParams.start) ?? null,
        end: context.params.get(this.timeRangeFromParams.end) ?? null,
      },
    };
  }

  async execute(context: RunbookContext): Promise<StepResult<ReadonlyArray<InteropK8sCidTrackerResult>>> {
    const analysis = readApplicationAnalysis(context, this.fromStep);
    if (analysis === undefined) return { success: false, error: `Step output not found: "${this.fromStep}"` };

    const logGroup = readRequiredVar(context, this.logGroupVar);
    if (logGroup === undefined) {
      return { success: false, error: `Missing required runbook variable: ${this.logGroupVar}` };
    }

    if (analysis.cids.length === 0) {
      context.logger?.text('  └─ Query CID tracker: skip, nessun CID disponibile');
      return {
        success: true,
        output: [],
        vars: {
          [varName(this.varPrefix, 'Executed')]: 'false',
          [varName(this.varPrefix, 'CidCount')]: '0',
          [varName(this.varPrefix, 'LogCount')]: '0',
        },
      };
    }

    const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
    const options = buildQueryOptions(context);
    const cidResults: InteropK8sCidTrackerResult[] = [];
    const statistics: AWSCloudWatchLogsQueryStatistics[] = [];
    const queryExecutions: AWSCloudWatchLogsQueryExecution[] = [];
    let totalRows = 0;

    for (const cid of analysis.cids) {
      context.logger?.text(`  ├─ Query CID tracker [cid=${cid}]`);
      const query = this.buildQuery(cid);
      const result = await context.services.cloudWatchLogs.queryWithStatistics([logGroup], query, timeRange, options);
      totalRows += result.rows.length;
      statistics.push(result.statistics);
      queryExecutions.push(...result.queryExecutions);
      cidResults.push({ cid, rows: result.rows });
    }

    context.logger?.text(`  └─ Log CID tracker trovati: ${totalRows}`);

    return {
      success: true,
      output: cidResults,
      diagnostics: toStepDiagnostics(totalRows, statistics, queryExecutions),
      vars: {
        [varName(this.varPrefix, 'Executed')]: 'true',
        [varName(this.varPrefix, 'CidCount')]: String(analysis.cids.length),
        [varName(this.varPrefix, 'LogCount')]: String(totalRows),
      },
    };
  }
}

function readApplicationAnalysis(
  context: RunbookContext,
  stepId: string,
): InteropK8sApplicationLogAnalysis | undefined {
  const value = context.stepResults.get(stepId);
  if (!isApplicationAnalysis(value)) return undefined;
  return value;
}

function isApplicationAnalysis(value: unknown): value is InteropK8sApplicationLogAnalysis {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Readonly<Record<string, unknown>>;
  return Array.isArray(record['cids']) && typeof record['logCount'] === 'number';
}

function readRequiredVar(context: RunbookContext, key: string): string | undefined {
  const value = context.vars.get(key)?.trim();
  return value === undefined || value === '' ? undefined : value;
}

function buildQueryOptions(context: RunbookContext): AWSCloudWatchLogsQueryOptions {
  return {
    ...(context.signal === undefined ? {} : { signal: context.signal }),
    logGroupResolutionMode: 'search-configured-profiles',
  };
}

function toStepDiagnostics(
  rowsReturned: number,
  statistics: ReadonlyArray<AWSCloudWatchLogsQueryStatistics>,
  queryExecutions: ReadonlyArray<AWSCloudWatchLogsQueryExecution>,
): StepDiagnostics {
  return {
    cloudWatchLogs: {
      rowsReturned,
      statistics: sumCloudWatchLogsQueryStatistics(statistics),
      queryExecutions,
    },
  };
}

function varName(prefix: string, suffix: string): string {
  return `${prefix}${suffix}`;
}
