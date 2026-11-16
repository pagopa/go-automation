import { type GOLogsInsightsResultField, readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { Step } from '../../../../../engine/types/Step.js';
import type { StepKind } from '../../../../../engine/types/StepKind.js';
import type { RunbookContext } from '../../../../../engine/types/RunbookContext.js';
import type { StepResult } from '../../../../../engine/types/StepResult.js';
import { readStepOutput } from '../../../../../engine/context/readStepOutput.js';
import type { TimeRangeFromParams } from '../../../time/TimeRangeFromParams.js';
import { resolveTimeRange } from '../../../time/resolveTimeRange.js';
import { executeStep } from '../../../../../engine/steps/execution/executeStep.js';
import { executeCloudWatchLogsQuery } from '../../../steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.js';
import type { ExecutedCloudWatchLogsQuery } from '../../../steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.js';

import { buildApiGwVars, rowMeetsThreshold, sanitizeApiGwField } from '../accessLog/accessLogRow.js';
import { ApiGwReporter } from '../reporting/ApiGwReporter.js';
import type { ExecutionLogSpec } from '../executionLog/ExecutionLogSpec.js';
import type { AccessLogSchema } from '../accessLog/AccessLogSchema.js';
import { renderQueryTemplate } from '../../../queries/renderQueryTemplate.js';
import type { ApiGwExecutionLogAnalysisMode } from '../types/ApiGwExecutionLogAnalysisMode.js';
import { OperationalStep } from '../../../steps/OperationalStep.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { OperationalServiceName } from '../../../services/OperationalServiceName.js';

const QUERY_MODE_VAR = 'apiGwExecutionLogMode';

interface RequestIdWithPath {
  readonly path: string;
  readonly requestId: string;
}

/**
 * Configuration for {@link QueryApiGwExecutionLogsStep}.
 */
export interface QueryApiGwExecutionLogsConfig {
  /** Unique step identifier. */
  readonly id: string;
  /** Human-readable label. */
  readonly label: string;
  /** Step id of the API Gateway AccessLog query. */
  readonly fromStep: string;
  /** API Gateway execution log group to query when requestIds are found. */
  readonly executionLogGroup?: string;
  /** Minimum HTTP status code to include (default: 500). */
  readonly minStatusCode?: number;
  /** Mapping for the time-range parameters in the runbook context. */
  readonly timeRangeFromParams: TimeRangeFromParams;
  /**
   * Specification dell'execution log (dal profilo del prodotto).
   */
  readonly spec: ExecutionLogSpec;
  /**
   * Schema dell'AccessLog (per leggere i campi `requestId`, `path`,
   * `errorMessage`, `statusFields`, sentinels).
   */
  readonly accessLogSchema: AccessLogSchema;
  /**
   * Identificatore del profilo per i metadati di trace.
   */
  readonly queryProfileId: string;
  /**
   * Override del limite `maxRequestIds` dello spec a livello di runbook.
   * Quando assente, viene usato `spec.maxRequestIds`.
   */
  readonly maxRequestIdsOverride?: number;

  /** Default `terminal`; see {@link ApiGwExecutionLogAnalysisMode}. */
  readonly analysisMode?: ApiGwExecutionLogAnalysisMode;
}

export class QueryApiGwExecutionLogsStep
  extends OperationalStep<ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>>
  implements Step<ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>>
{
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly fromStep: string;
  private readonly executionLogGroup: string | undefined;
  private readonly minStatusCode: number;
  private readonly timeRangeFromParams: TimeRangeFromParams;
  private readonly spec: ExecutionLogSpec;
  private readonly accessLogSchema: AccessLogSchema;
  private readonly queryProfileId: string;
  private readonly maxRequestIdsOverride: number | undefined;
  private readonly analysisMode: ApiGwExecutionLogAnalysisMode;

  constructor(config: QueryApiGwExecutionLogsConfig) {
    super();
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.executionLogGroup = config.executionLogGroup;
    this.minStatusCode = config.minStatusCode ?? 500;
    this.timeRangeFromParams = config.timeRangeFromParams;
    this.spec = config.spec;
    this.accessLogSchema = config.accessLogSchema;
    this.queryProfileId = config.queryProfileId;
    this.maxRequestIdsOverride = config.maxRequestIdsOverride;
    this.analysisMode = config.analysisMode ?? 'terminal';
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    const startStr = context.params.get(this.timeRangeFromParams.start);
    const endStr = context.params.get(this.timeRangeFromParams.end);

    return {
      queryProfileId: this.queryProfileId,
      queryKind: 'execution-log',
      identifierMode: 'request-id',
      logGroups: this.executionLogGroup !== undefined ? [this.executionLogGroup] : [],
      timeRange: { start: startStr ?? null, end: endStr ?? null },
      modeVar: QUERY_MODE_VAR,
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

  override async execute(
    context: OperationalContext,
  ): Promise<StepResult<ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>>> {
    return executeStep('API Gateway execution logs query', async () => {
      const upstream = readStepOutput<ReadonlyArray<GOLogsInsightsResultField[]>>(context, this.fromStep);
      if (!upstream.ok) return upstream.failure;
      const accessLogRows = upstream.value;
      const rowsWithErrorMessage = accessLogRows.filter((row) => this.rowHasApiGwErrorMessage(row));
      if (rowsWithErrorMessage.length === 0) {
        return {
          success: true,
          output: [],
          vars: {
            [QUERY_MODE_VAR]: 'skipped',
            apiGwExecutionLogRequestCount: '0',
            apiGwExecutionLogCount: '0',
          },
        };
      }

      if (this.executionLogGroup === undefined || this.executionLogGroup.trim() === '') {
        return {
          success: true,
          output: [],
          vars: {
            [QUERY_MODE_VAR]: 'not-configured',
            apiGwExecutionLogRequestCount: '0',
            apiGwExecutionLogCount: '0',
          },
        };
      }

      const reporter = new ApiGwReporter(context.services.reporter);
      const firstRow = rowsWithErrorMessage[0];
      const accessLogVars =
        firstRow !== undefined
          ? buildApiGwVars(firstRow, rowsWithErrorMessage.length, this.accessLogSchema)
          : { apiGwErrorCount: String(rowsWithErrorMessage.length) };

      const requestIds = collectRequestIds(rowsWithErrorMessage, this.accessLogSchema);
      if (requestIds.length === 0) {
        return {
          success: true,
          output: [],
          vars: {
            ...accessLogVars,
            [QUERY_MODE_VAR]: 'no-request-id',
            apiGwExecutionLogGroup: this.executionLogGroup,
            apiGwExecutionLogRequestCount: '0',
            apiGwExecutionLogRequestIds: '',
            apiGwExecutionLogPaths: '',
            apiGwExecutionLogCount: '0',
          },
        };
      }

      // V04 (D5): limite difensivo sulla OR clause. Le query CW Logs
      // Insights hanno limiti pratici sulla lunghezza; fail-fast invece
      // di mandare una query che AWS rifiuterebbe.
      const limit = this.maxRequestIdsOverride ?? this.spec.maxRequestIds;
      if (requestIds.length > limit) {
        const error =
          `Execution log query would combine ${requestIds.length} requestId predicates, ` +
          `over the limit of ${limit}. ` +
          'Either reduce the time window, raise `ApiGwAlarmConfig.executionLogMaxRequestIds` ' +
          'consciously, or split the runbook by sub-path.';
        reporter?.sectionApiGwExecutionLog();
        reporter?.apiGwExecutionLogSkipped(this.executionLogGroup, error);
        if (this.analysisMode === 'best-effort') {
          return this.buildUnavailableResult(accessLogVars, requestIds, error);
        }
        return { success: false, error };
      }

      reporter?.sectionApiGwExecutionLog();
      reporter?.apiGwExecutionLogQuery(this.executionLogGroup, requestIds);

      const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
      const query = this.buildExecutionLogQuery(requestIds);

      // V04 (C3/D7): UNA sola chiamata AWS per N requestId, OR-combinati.
      let queryResult: ExecutedCloudWatchLogsQuery;
      try {
        queryResult = await executeCloudWatchLogsQuery(context, [this.executionLogGroup], query, timeRange, {
          ...(context.signal !== undefined ? { signal: context.signal } : {}),
          logGroupResolutionMode: 'search-configured-profiles',
        });
      } catch (error: unknown) {
        if (this.analysisMode === 'terminal') throw error;
        const message = error instanceof Error ? error.message : String(error);
        reporter?.queryFailed([this.executionLogGroup], message);
        return this.buildUnavailableResult(accessLogVars, requestIds, message);
      }
      const rows = queryResult.rows;

      // Riassociazione requestId/path per ogni riga restituita. SEND
      // usa predicate `@message like '<id>'` quindi `includes` su
      // `@message` è corretto. Per profili con predicate strutturati la
      // riassociazione andrà spostata nel profilo (roadmap §12.3).
      const output: GOLogsInsightsResultField[][] = [];
      for (const row of rows) {
        const message = readRowField(row, '@message') ?? '';
        const matched = requestIds.find((req) => message.includes(req.requestId));
        output.push([
          ...row,
          { field: 'requestId', value: matched?.requestId ?? '' },
          { field: 'path', value: matched?.path ?? '' },
        ]);
      }

      reporter?.apiGwExecutionLogResult(output.length);

      return {
        success: true,
        output,
        ...(queryResult.diagnostics !== undefined ? { diagnostics: queryResult.diagnostics } : {}),
        vars: {
          ...accessLogVars,
          [QUERY_MODE_VAR]: 'queried',
          apiGwExecutionLogGroup: this.executionLogGroup,
          apiGwExecutionLogRequestCount: String(requestIds.length),
          apiGwExecutionLogRequestIds: requestIds.map((request) => request.requestId).join(','),
          apiGwExecutionLogPaths: requestIds.map((request) => request.path).join(','),
          apiGwExecutionLogCount: String(output.length),
          ...(this.analysisMode === 'terminal'
            ? {
                terminationReason: 'api-gw-execution-log-unresolved',
                lastErrorMsg: buildUnresolvedMessage(requestIds.length),
              }
            : {}),
        },
        next: 'resolve' as const,
      };
    });
  }

  private buildUnavailableResult(
    accessLogVars: Readonly<Record<string, string>>,
    requestIds: ReadonlyArray<RequestIdWithPath>,
    reason: string,
  ): StepResult<ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>> {
    return {
      success: true,
      output: [],
      vars: {
        ...accessLogVars,
        [QUERY_MODE_VAR]: 'unavailable',
        apiGwExecutionLogGroup: this.executionLogGroup ?? '',
        apiGwExecutionLogRequestCount: String(requestIds.length),
        apiGwExecutionLogRequestIds: requestIds.map((request) => request.requestId).join(','),
        apiGwExecutionLogPaths: requestIds.map((request) => request.path).join(','),
        apiGwExecutionLogCount: '0',
        apiGwExecutionLogUnavailableReason: reason,
      },
    };
  }

  private rowHasApiGwErrorMessage(row: ReadonlyArray<GOLogsInsightsResultField>): boolean {
    if (!rowMeetsThreshold(row, this.minStatusCode, this.accessLogSchema)) return false;
    return sanitizeApiGwField(readRowField(row, this.accessLogSchema.errorMessageField), this.accessLogSchema) !== '';
  }

  /**
   * Costruisce la query OR-combinata su tutti i requestId estratti dal
   * AccessLog. Una sola chiamata AWS al posto di N (pattern pre-V04).
   */
  private buildExecutionLogQuery(requestIds: ReadonlyArray<RequestIdWithPath>): string {
    const predicates = requestIds.map((req) =>
      renderQueryTemplate(this.spec.requestIdPredicateTemplate, {
        values: { '{{VALUE}}': req.requestId },
        escape: 'sql',
        queryId: `${this.queryProfileId}.executionLog.requestIdPredicate`,
      }),
    );
    const filterClause = `filter ${predicates.map((p) => `(${p})`).join(' or ')}`;

    return renderQueryTemplate(this.spec.queryTemplate, {
      values: { '{{REQUEST_ID_FILTER_CLAUSE}}': filterClause },
      escape: 'none',
      queryId: `${this.queryProfileId}.executionLog`,
    });
  }
}

function collectRequestIds(
  rows: ReadonlyArray<GOLogsInsightsResultField[]>,
  schema: AccessLogSchema,
): ReadonlyArray<RequestIdWithPath> {
  const byRequestId = new Map<string, RequestIdWithPath>();
  for (const row of rows) {
    const requestId = sanitizeApiGwField(readRowField(row, schema.requestIdField), schema);
    if (requestId === '') continue;

    const rawPath = sanitizeApiGwField(readRowField(row, schema.pathField), schema);
    const path = rawPath === '' ? requestId : rawPath;
    if (!byRequestId.has(requestId)) {
      byRequestId.set(requestId, { path, requestId });
    }
  }
  return [...byRequestId.values()];
}

function buildUnresolvedMessage(requestCount: number): string {
  if (requestCount === 0) {
    return "API Gateway ha prodotto un errorMessage, ma non e' stato possibile recuperare requestId da analizzare.";
  }
  return "API Gateway execution log analizzati, ma non e' stato possibile determinare il problema.";
}
