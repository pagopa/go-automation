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
  /** Upper bound on the CIDs queried; defaults to {@link DEFAULT_MAX_CIDS}. */
  readonly maxCids?: number;
}

const DEFAULT_LOG_GROUP_VAR = 'interopLogGroup';
const DEFAULT_VAR_PREFIX = 'interopCidTracker';

/**
 * CIDs queried at most, one sequential CloudWatch query each.
 *
 * A safety bound, not a semantic one: the known cases match against this step's
 * raw rows, so every skipped CID is evidence lost. It exists because the
 * upstream scan returns one row per log line — up to 10.000 on the API Gateway
 * 5xx profile, unbounded on the k8s one — and an unbounded fan-out lets a
 * single alarm issue thousands of sequential queries.
 *
 * A hundred costs ~100 s against the 720 s worker budget at one second per
 * query, and overruns it only when queries are slow. Watch
 * `<varPrefix>SkippedCidCount` on real runs: a value that is always zero means
 * the bound never bites, a value often above zero means it is cutting evidence
 * and the fix is one query for all CIDs, not a larger number.
 */
const DEFAULT_MAX_CIDS = 100;

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
  private readonly maxCids: number;

  constructor(config: QueryInteropK8sCidTrackerStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.timeRangeFromParams = config.timeRangeFromParams;
    this.logGroupVar = config.logGroupVar ?? DEFAULT_LOG_GROUP_VAR;
    this.varPrefix = config.varPrefix ?? DEFAULT_VAR_PREFIX;
    this.queryProfileId = config.queryProfileId ?? INTEROP_K8S_QUERY_PROFILE.cidTrackerQueryProfileId;
    this.buildQuery = config.buildQuery ?? INTEROP_K8S_QUERY_PROFILE.buildCidTrackerQuery;
    this.maxCids = config.maxCids ?? DEFAULT_MAX_CIDS;
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    const logGroup = context.vars.get(this.logGroupVar);
    const analysis = readApplicationAnalysis(context, this.fromStep);
    const cids = (analysis?.cids ?? []).slice(0, this.maxCids);
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
      context.services.reporter.add({ label: 'Query CID tracker: skip, nessun CID disponibile' });
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

    const queriedCids = analysis.cids.slice(0, this.maxCids);
    const skippedCids = analysis.cids.length - queriedCids.length;
    if (skippedCids > 0) {
      context.services.reporter.add({
        label: `Query CID tracker: ${String(queriedCids.length)} CID su ${String(analysis.cids.length)} (limite ${String(this.maxCids)})`,
      });
    }

    const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
    const options = buildQueryOptions(context);
    const cidResults: InteropK8sCidTrackerResult[] = [];
    const statistics: AWSCloudWatchLogsQueryStatistics[] = [];
    const queryExecutions: AWSCloudWatchLogsQueryExecution[] = [];
    let totalRows = 0;

    for (const cid of queriedCids) {
      context.services.reporter.add({ label: `Query CID tracker [cid=${cid}]` });
      const query = this.buildQuery(cid);
      const result = await context.services.cloudWatchLogs.queryWithStatistics([logGroup], query, timeRange, options);
      totalRows += result.rows.length;
      statistics.push(result.statistics);
      queryExecutions.push(...result.queryExecutions);
      cidResults.push({ cid, rows: result.rows });
    }

    context.services.reporter.add({ label: `Log CID tracker trovati: ${totalRows}` });

    return {
      success: true,
      output: cidResults,
      diagnostics: toStepDiagnostics(totalRows, statistics, queryExecutions),
      vars: {
        [varName(this.varPrefix, 'Executed')]: 'true',
        [varName(this.varPrefix, 'CidCount')]: String(queriedCids.length),
        [varName(this.varPrefix, 'LogCount')]: String(totalRows),
        [varName(this.varPrefix, 'SkippedCidCount')]: String(skippedCids),
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
