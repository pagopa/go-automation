import type { ResultField } from '@go-automation/go-common/aws';

import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';
import { readStepOutput } from '../../steps/data/readStepOutput.js';
import type { TimeRangeFromParams } from '../../steps/data/CloudWatchLogsQueryStep.js';
import { resolveTimeRange } from '../../steps/data/resolveTimeRange.js';
import { executeStep } from '../../steps/data/executeStep.js';

import { extractCwField } from '../helpers/extractCwField.js';
import { buildApiGwVars, rowMeetsThreshold, sanitizeApiGwField } from '../helpers/accessLogRow.js';
import { ApiGwReporter } from '../reporting/ApiGwReporter.js';
import type { ExecutionLogSpec } from '../profiles/specs/ExecutionLogSpec.js';
import type { AccessLogSchema } from '../profiles/schemas/AccessLogSchema.js';
import { SEND_API_GW_PROFILE } from '../profiles/SEND_API_GW_PROFILE.js';
import { renderQueryTemplate } from '../profiles/render/renderQueryTemplate.js';

const QUERY_MODE_VAR = 'apiGwExecutionLogMode';

interface RequestIdWithPath {
  readonly path: string;
  readonly requestId: string;
}

/**
 * Configuration for {@link queryApiGwExecutionLogs}.
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
   * Specification dell'execution log. Quando omessa, viene usata la spec
   * SEND di default per back-compat.
   */
  readonly spec?: ExecutionLogSpec;
  /**
   * Schema dell'AccessLog (per leggere i campi `requestId`, `path`,
   * `errorMessage`, `statusFields`, sentinels).
   */
  readonly accessLogSchema?: AccessLogSchema;
  /**
   * Identificatore del profilo per i metadati di trace. Default `'send'`.
   */
  readonly queryProfileId?: string;
  /**
   * Override del limite `maxRequestIds` dello spec a livello di runbook.
   * Quando assente, viene usato `spec.maxRequestIds`.
   */
  readonly maxRequestIdsOverride?: number;
}

class QueryApiGwExecutionLogsStepImpl implements Step<ReadonlyArray<ReadonlyArray<ResultField>>> {
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

  constructor(config: QueryApiGwExecutionLogsConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.executionLogGroup = config.executionLogGroup;
    this.minStatusCode = config.minStatusCode ?? 500;
    this.timeRangeFromParams = config.timeRangeFromParams;
    if (config.spec === undefined && SEND_API_GW_PROFILE.executionLog === undefined) {
      throw new Error('SEND_API_GW_PROFILE.executionLog is undefined — impossible default');
    }
    this.spec = config.spec ?? (SEND_API_GW_PROFILE.executionLog as ExecutionLogSpec);
    this.accessLogSchema = config.accessLogSchema ?? SEND_API_GW_PROFILE.accessLog.schema;
    this.queryProfileId = config.queryProfileId ?? SEND_API_GW_PROFILE.id;
    this.maxRequestIdsOverride = config.maxRequestIdsOverride;
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

  async execute(context: RunbookContext): Promise<StepResult<ReadonlyArray<ReadonlyArray<ResultField>>>> {
    return executeStep('API Gateway execution logs query', async () => {
      const upstream = readStepOutput<ReadonlyArray<ResultField[]>>(context, this.fromStep);
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

      const reporter = context.logger !== undefined ? new ApiGwReporter(context.logger) : undefined;
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
        return {
          success: false,
          error:
            `Execution log query would combine ${requestIds.length} requestId predicates, ` +
            `over the limit of ${limit}. ` +
            'Either reduce the time window, raise `ApiGwAlarmConfig.executionLogMaxRequestIds` ' +
            'consciously, or split the runbook by sub-path.',
        };
      }

      reporter?.sectionApiGwExecutionLog();
      reporter?.apiGwExecutionLogQuery(this.executionLogGroup, requestIds);

      const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
      const query = this.buildExecutionLogQuery(requestIds);

      // V04 (C3/D7): UNA sola chiamata AWS per N requestId, OR-combinati.
      const rows = await context.services.cloudWatchLogs.query([this.executionLogGroup], query, timeRange, {
        ...(context.signal !== undefined ? { signal: context.signal } : {}),
        logGroupResolutionMode: 'search-configured-profiles',
      });

      // Riassociazione requestId/path per ogni riga restituita. SEND
      // usa predicate `@message like '<id>'` quindi `includes` su
      // `@message` è corretto. Per profili con predicate strutturati la
      // riassociazione andrà spostata nel profilo (roadmap §12.3).
      const output: ResultField[][] = [];
      for (const row of rows) {
        const message = extractCwField(row, '@message') ?? '';
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
        vars: {
          ...accessLogVars,
          [QUERY_MODE_VAR]: 'queried',
          apiGwExecutionLogGroup: this.executionLogGroup,
          apiGwExecutionLogRequestCount: String(requestIds.length),
          apiGwExecutionLogRequestIds: requestIds.map((request) => request.requestId).join(','),
          apiGwExecutionLogPaths: requestIds.map((request) => request.path).join(','),
          apiGwExecutionLogCount: String(output.length),
          terminationReason: 'api-gw-execution-log-unresolved',
          lastErrorMsg: buildUnresolvedMessage(requestIds.length),
        },
        next: 'resolve' as const,
      };
    });
  }

  private rowHasApiGwErrorMessage(row: ReadonlyArray<ResultField>): boolean {
    if (!rowMeetsThreshold(row, this.minStatusCode, this.accessLogSchema)) return false;
    return sanitizeApiGwField(extractCwField(row, this.accessLogSchema.errorMessageField), this.accessLogSchema) !== '';
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
  rows: ReadonlyArray<ResultField[]>,
  schema: AccessLogSchema,
): ReadonlyArray<RequestIdWithPath> {
  const byRequestId = new Map<string, RequestIdWithPath>();
  for (const row of rows) {
    const requestId = sanitizeApiGwField(extractCwField(row, schema.requestIdField), schema);
    if (requestId === '') continue;

    const rawPath = sanitizeApiGwField(extractCwField(row, schema.pathField), schema);
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

/**
 * Factory: creates the requestId-based API Gateway execution-log query step.
 *
 * V04: la query è UNA sola chiamata AWS con filter clause OR-combinata su
 * tutti i requestId (al posto di N chiamate sequenziali pre-V04). Un
 * limite difensivo (`spec.maxRequestIds`, default 50) protegge da query
 * troppo lunghe per CloudWatch Logs Insights.
 */
export function queryApiGwExecutionLogs(
  config: QueryApiGwExecutionLogsConfig,
): Step<ReadonlyArray<ReadonlyArray<ResultField>>> {
  return new QueryApiGwExecutionLogsStepImpl(config);
}
