import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';

import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';
import type { TimeRangeFromParams } from '../../steps/data/CloudWatchLogsQueryStep.js';
import { resolveTimeRange } from '../../steps/data/resolveTimeRange.js';
import { escapeSqlString } from '../../steps/data/interpolateTemplate.js';
import { executeStep } from '../../steps/data/executeStep.js';

import { extractCwField } from '../helpers/extractCwField.js';
import { ApiGwReporter } from '../reporting/ApiGwReporter.js';

const STATUS_FIELDS = ['status', 'authorizeStatus', 'integrationServiceStatus'] as const;

const QUERY_MODE_VAR = 'apiGwExecutionLogMode';

const FIELD_TO_VAR: ReadonlyArray<readonly [field: string, contextVar: string]> = [
  ['errorMessage', 'apiGwErrorMessage'],
  ['httpMethod', 'apiGwHttpMethod'],
  ['path', 'apiGwPath'],
  ['authorizeStatus', 'apiGwAuthorizeStatus'],
  ['integrationServiceStatus', 'apiGwIntegrationServiceStatus'],
  ['requestId', 'apiGwRequestId'],
  ['authorizerRequestId', 'apiGwAuthorizerRequestId'],
  ['integrationRequestId', 'apiGwIntegrationRequestId'],
];

interface RequestIdByPath {
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
}

class QueryApiGwExecutionLogsStepImpl implements Step<ReadonlyArray<ReadonlyArray<ResultField>>> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly fromStep: string;
  private readonly executionLogGroup: string | undefined;
  private readonly minStatusCode: number;
  private readonly timeRangeFromParams: TimeRangeFromParams;

  constructor(config: QueryApiGwExecutionLogsConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.executionLogGroup = config.executionLogGroup;
    this.minStatusCode = config.minStatusCode ?? 500;
    this.timeRangeFromParams = config.timeRangeFromParams;
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    const startStr = context.params.get(this.timeRangeFromParams.start);
    const endStr = context.params.get(this.timeRangeFromParams.end);

    return {
      logGroups: this.executionLogGroup !== undefined ? [this.executionLogGroup] : [],
      timeRange: { start: startStr ?? null, end: endStr ?? null },
      modeVar: QUERY_MODE_VAR,
    };
  }

  async execute(context: RunbookContext): Promise<StepResult<ReadonlyArray<ReadonlyArray<ResultField>>>> {
    return executeStep('API Gateway execution logs query', async () => {
      const rawOutput = context.stepResults.get(this.fromStep);
      if (rawOutput === undefined) {
        return { success: false, error: `Step output not found: "${this.fromStep}"` };
      }

      const accessLogRows = rawOutput as ReadonlyArray<ResultField[]>;
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
          ? buildApiGwVars(firstRow, rowsWithErrorMessage.length)
          : { apiGwErrorCount: String(rowsWithErrorMessage.length) };
      if (firstRow !== undefined) {
        reporter?.apiGwResult({
          errorCount: rowsWithErrorMessage.length,
          statusCode: pickPrimaryStatusCode(firstRow),
          xRayTraceId: undefined,
          ...optionalApiGwField(firstRow, 'errorMessage', 'errorMessage'),
          ...optionalApiGwField(firstRow, 'path', 'path'),
          ...optionalApiGwField(firstRow, 'httpMethod', 'httpMethod'),
        });
      }

      const requestIds = collectRequestIdsByPath(rowsWithErrorMessage);
      if (requestIds.length === 0) {
        return {
          success: true,
          output: [],
          vars: {
            ...accessLogVars,
            [QUERY_MODE_VAR]: 'queried',
            apiGwExecutionLogGroup: this.executionLogGroup,
            apiGwExecutionLogRequestCount: String(requestIds.length),
            apiGwExecutionLogRequestIds: requestIds.map((request) => request.requestId).join(','),
            apiGwExecutionLogPaths: requestIds.map((request) => request.path).join(','),
            apiGwExecutionLogCount: '0',
            terminationReason: 'api-gw-execution-log-unresolved',
            lastErrorMsg: buildUnresolvedMessage(requestIds.length),
          },
          next: 'resolve' as const,
        };
      }

      reporter?.apiGwExecutionLogQuery(this.executionLogGroup, requestIds);

      const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
      const output: ResultField[][] = [];
      for (const request of requestIds) {
        const rows = await context.services.cloudWatchLogs.query(
          [this.executionLogGroup],
          buildQuery(request.requestId),
          timeRange,
          {
            ...(context.signal !== undefined ? { signal: context.signal } : {}),
            logGroupResolutionMode: 'search-configured-profiles',
          },
        );

        for (const row of rows) {
          output.push([
            ...row,
            { field: 'requestId', value: request.requestId },
            { field: 'path', value: request.path },
          ]);
        }
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
    if (!rowMeetsThreshold(row, this.minStatusCode)) return false;
    return sanitizeApiGwField(extractCwField(row, 'errorMessage')) !== '';
  }
}

function collectRequestIdsByPath(rows: ReadonlyArray<ResultField[]>): ReadonlyArray<RequestIdByPath> {
  const byPath = new Map<string, RequestIdByPath>();
  for (const row of rows) {
    const requestId = sanitizeApiGwField(extractCwField(row, 'requestId'));
    if (requestId === '') continue;

    const rawPath = sanitizeApiGwField(extractCwField(row, 'path'));
    const path = rawPath === '' ? requestId : rawPath;
    if (!byPath.has(path)) {
      byPath.set(path, { path, requestId });
    }
  }
  return [...byPath.values()];
}

function rowMeetsThreshold(row: ReadonlyArray<ResultField>, minStatusCode: number): boolean {
  for (const field of STATUS_FIELDS) {
    const raw = extractCwField(row, field);
    if (raw === undefined) continue;
    const num = Number(raw);
    if (!Number.isNaN(num) && num >= minStatusCode) {
      return true;
    }
  }
  return false;
}

function pickPrimaryStatusCode(row: ReadonlyArray<ResultField>): string {
  for (const field of STATUS_FIELDS) {
    const raw = extractCwField(row, field);
    if (raw === undefined) continue;
    if (!Number.isNaN(Number(raw))) {
      return raw;
    }
  }
  return '';
}

function buildApiGwVars(row: ReadonlyArray<ResultField>, errorCount: number): Record<string, string> {
  const vars: Record<string, string> = {
    apiGwErrorCount: String(errorCount),
    apiGwStatusCode: pickPrimaryStatusCode(row),
  };
  for (const [field, contextVar] of FIELD_TO_VAR) {
    const raw = extractCwField(row, field);
    if (raw !== undefined) {
      vars[contextVar] = raw;
    }
  }
  return vars;
}

function optionalApiGwField<K extends 'errorMessage' | 'path' | 'httpMethod'>(
  row: ReadonlyArray<ResultField>,
  field: string,
  outputKey: K,
): Partial<Record<K, string>> {
  const value = sanitizeApiGwField(extractCwField(row, field));
  return value === '' ? {} : ({ [outputKey]: value } as Partial<Record<K, string>>);
}

function sanitizeApiGwField(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim();
  return trimmed === '-' ? '' : trimmed;
}

function buildQuery(requestId: string): string {
  return [
    `filter @message like '${escapeSqlString(requestId)}'`,
    '| sort @timestamp asc',
    '| display @timestamp, @message',
  ].join('\n');
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
 * The step runs immediately after the API Gateway AccessLog query. When
 * no AccessLog row carries a meaningful `errorMessage`, it is a no-op
 * and the runbook continues with the normal X-Ray flow. When at least
 * one `errorMessage` is present and an execution log group is
 * configured, it queries one requestId per distinct path, then signals
 * `next: 'resolve'` so known cases can match before the following guard
 * step stops the runbook as non-determinable.
 */
export function queryApiGwExecutionLogs(
  config: QueryApiGwExecutionLogsConfig,
): Step<ReadonlyArray<ReadonlyArray<ResultField>>> {
  return new QueryApiGwExecutionLogsStepImpl(config);
}
