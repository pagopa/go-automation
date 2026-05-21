import type { ResultField } from '@go-automation/go-common/aws';

import type { Runbook } from '../../types/Runbook.js';
import type { RunbookExecutionResult } from '../../types/RunbookExecutionResult.js';
import type { RunbookEvidence, RunbookOutputContext, RunbookResultField } from '../../output/RunbookOutputContext.js';
import { extractCwField } from '../helpers/extractCwField.js';
import type {
  ApiGwAuthorizerOutcome,
  ApiGwAuthorizerOutput,
  ApiGwExecutionLogsOutput,
  ApiGwLogLine,
  ApiGwOutputContext,
  ApiGwServiceOutput,
} from './ApiGwOutputContext.js';
import { isApiGwRunbookContext } from './ApiGwRunbookContext.js';

const DEFAULT_MAX_RECENT_LOGS = 5;

export interface BuildApiGwOutputContextOptions {
  readonly maxRecentLogs?: number;
}

export function buildApiGwOutputContext(
  runbook: Runbook,
  result: RunbookExecutionResult,
  options: BuildApiGwOutputContextOptions = {},
): RunbookOutputContext | undefined {
  if (!isApiGwRunbookContext(runbook.runbookContext)) {
    return undefined;
  }

  const maxRecentLogs = options.maxRecentLogs ?? DEFAULT_MAX_RECENT_LOGS;
  const vars = result.finalContext.vars;
  const params = result.finalContext.params;
  const accessLogRows = readRows(result.finalContext.stepResults.get('query-api-gw-logs'));
  const apiGwRecentLogs = extractRecentLogs(accessLogRows, maxRecentLogs);
  const serviceContexts = runbook.runbookContext.services.map((service) => {
    const serviceRows = readRows(result.finalContext.stepResults.get(`query-${service.name}`));
    return {
      name: service.name,
      logGroup: service.logGroup,
      logCount: parseInteger(vars.get(`${service.varPrefix}LogCount`)) ?? serviceRows.length,
      ...optionalString('errorMessage', vars.get(`${service.varPrefix}ErrorMsg`)),
      ...optionalString('knownUrl', vars.get(`${service.varPrefix}NextUrl`)),
      ...optionalString('knownUrlTarget', vars.get(`${service.varPrefix}NextUrlTarget`)),
      recentLogs: extractRecentLogs(serviceRows, maxRecentLogs),
    };
  });

  const apiGwContext: ApiGwOutputContext = {
    alarm: {
      ...optionalString('name', params.get('alarmName')),
      ...optionalString('datetime', params.get('alarmDatetime')),
      ...optionalString('datetimeEnd', params.get('alarmDatetimeEnd')),
      timeRange: {
        ...optionalString('start', params.get('startTime')),
        ...optionalString('end', params.get('endTime')),
      },
    },
    apiGateway: {
      logGroup: runbook.runbookContext.apiGwLogGroup,
      ...optionalNumber('errorCount', parseInteger(vars.get('apiGwErrorCount'))),
      ...optionalString('statusCode', vars.get('apiGwStatusCode')),
      ...optionalString('httpMethod', vars.get('apiGwHttpMethod')),
      ...optionalString('path', vars.get('apiGwPath')),
      ...optionalString('traceId', resolveTraceId(vars)),
      ...optionalString('traceIdField', resolveTraceIdField(vars)),
      ...optionalString('fallbackUuid', vars.get('fallbackUuid')),
      ...optionalString('errorMessage', vars.get('apiGwErrorMessage')),
      recentLogs: apiGwRecentLogs,
    },
    ...optionalAuthorizer(vars),
    ...optionalExecutionLogs(vars),
    services: serviceContexts,
  };

  return {
    fields: buildFields(vars, params),
    evidence: buildEvidence(apiGwRecentLogs, serviceContexts, maxRecentLogs, accessLogRows.length),
    details: apiGwContext as unknown as Readonly<Record<string, unknown>>,
  };
}

function buildFields(
  vars: ReadonlyMap<string, string>,
  params: ReadonlyMap<string, string>,
): ReadonlyArray<RunbookResultField> {
  const fields: RunbookResultField[] = [];
  addField(fields, 'alarmName', 'Alarm', params.get('alarmName'));
  addField(fields, 'alarmDatetime', 'Alarm datetime', params.get('alarmDatetime'));
  addField(fields, 'endpoint', 'Endpoint', endpoint(vars));
  addField(fields, 'apiGwStatusCode', 'API Gateway status', vars.get('apiGwStatusCode'));
  addField(fields, 'apiGwErrorMessage', 'API Gateway error message', vars.get('apiGwErrorMessage'));
  addField(fields, 'traceId', resolveTraceIdLabel(vars), resolveTraceId(vars));
  addField(fields, 'fallbackUuid', 'Fallback UUID', vars.get('fallbackUuid'));
  addField(fields, 'authorizerLambda', 'Lambda authorizer', vars.get('apiGwAuthorizerLambdaName'));
  addField(fields, 'authorizerStatus', 'authorizerStatus', vars.get('apiGwAuthorizerStatus'));
  addField(fields, 'authorizerLatency', 'authorizerLatency', authorizerLatencyLabel(vars));
  addField(fields, 'authorizerRequestId', 'authorizerRequestId', vars.get('apiGwAuthorizerRequestId'));
  addField(fields, 'executionLogMode', 'Execution log mode', vars.get('apiGwExecutionLogMode'));
  addField(fields, 'executionLogCount', 'Execution log trovati', vars.get('apiGwExecutionLogCount'));
  addField(fields, 'lastErrorMsg', 'Ultimo errore', vars.get('lastErrorMsg'));
  addField(fields, 'servicesVisited', 'Servizi analizzati', vars.get('apiGwServicesVisited'));
  return fields;
}

function buildEvidence(
  apiGwRecentLogs: ReadonlyArray<ApiGwLogLine>,
  services: ReadonlyArray<ApiGwServiceOutput>,
  maxRecentLogs: number,
  apiGwTotalRows: number,
): ReadonlyArray<RunbookEvidence> {
  const evidence: RunbookEvidence[] = [];
  if (apiGwRecentLogs.length > 0) {
    evidence.push({
      id: 'api-gw-recent-logs',
      label: 'Ultimi log API Gateway',
      type: 'log-sample',
      sourceStep: 'query-api-gw-logs',
      items: apiGwRecentLogs.map(logLineToRecord),
      truncated: apiGwTotalRows > maxRecentLogs,
    });
  }

  for (const service of services) {
    if (service.recentLogs.length === 0) continue;
    evidence.push({
      id: `${service.name}-recent-errors`,
      label: `Ultimi log errore ${service.name}`,
      type: 'log-sample',
      sourceStep: `query-${service.name}`,
      items: service.recentLogs.map(logLineToRecord),
      truncated: service.logCount > maxRecentLogs,
    });
  }
  return evidence;
}

function addField(fields: RunbookResultField[], name: string, label: string, value: string | undefined): void {
  const normalized = normalize(value);
  if (normalized === undefined) return;
  fields.push({ name, label, value: normalized });
}

function optionalAuthorizer(vars: ReadonlyMap<string, string>): {
  readonly authorizer?: ApiGwAuthorizerOutput;
} {
  const lambdaName = normalize(vars.get('apiGwAuthorizerLambdaName'));
  const status = normalize(vars.get('apiGwAuthorizerStatus'));
  const latencyMs =
    parseInteger(vars.get('apiGwAuthorizerLatencyMs')) ?? parseInteger(vars.get('apiGwAuthorizerLatency'));
  const requestId = normalize(vars.get('apiGwAuthorizerRequestId'));
  const timeoutMs = parseInteger(vars.get('apiGwAuthorizerTimeoutMs'));
  const outcome = authorizerOutcome(vars.get('apiGwAuthorizerOutcome'));

  if (
    lambdaName === undefined &&
    status === undefined &&
    latencyMs === undefined &&
    requestId === undefined &&
    timeoutMs === undefined &&
    outcome === undefined
  ) {
    return {};
  }

  return {
    authorizer: {
      ...optionalString('lambdaName', lambdaName),
      ...optionalNumber('timeoutMs', timeoutMs),
      ...optionalString('status', status),
      ...optionalNumber('latencyMs', latencyMs),
      ...optionalString('requestId', requestId),
      ...(outcome !== undefined ? { outcome } : {}),
    },
  };
}

function optionalExecutionLogs(vars: ReadonlyMap<string, string>): {
  readonly executionLogs?: ApiGwExecutionLogsOutput;
} {
  const mode = normalize(vars.get('apiGwExecutionLogMode'));
  const logGroup = normalize(vars.get('apiGwExecutionLogGroup'));
  const requestCount = parseInteger(vars.get('apiGwExecutionLogRequestCount'));
  const logCount = parseInteger(vars.get('apiGwExecutionLogCount'));
  const requestIds = splitCsv(vars.get('apiGwExecutionLogRequestIds'));
  const paths = splitCsv(vars.get('apiGwExecutionLogPaths'));

  if (
    mode === undefined &&
    logGroup === undefined &&
    requestCount === undefined &&
    logCount === undefined &&
    requestIds.length === 0
  ) {
    return {};
  }

  return {
    executionLogs: {
      ...optionalString('mode', mode),
      ...optionalString('logGroup', logGroup),
      ...optionalNumber('requestCount', requestCount),
      ...optionalNumber('logCount', logCount),
      requestIds: requestIds.map((requestId, index) => ({
        requestId,
        ...optionalString('path', paths[index]),
      })),
    },
  };
}

function readRows(value: unknown): ReadonlyArray<ReadonlyArray<ResultField>> {
  if (!Array.isArray(value)) return [];
  const rows: ResultField[][] = [];
  for (const row of value) {
    if (!Array.isArray(row)) continue;
    rows.push(row.filter(isResultField));
  }
  return rows;
}

function isResultField(value: unknown): value is ResultField {
  return typeof value === 'object' && value !== null && 'field' in value;
}

function extractRecentLogs(
  rows: ReadonlyArray<ReadonlyArray<ResultField>>,
  maxRecentLogs: number,
): ReadonlyArray<ApiGwLogLine> {
  const logLines = rows
    .map(rowToLogLine)
    .filter((line): line is ApiGwLogLine => line !== undefined)
    .sort((a, b) => timestampValue(a.timestamp) - timestampValue(b.timestamp));
  return logLines.slice(Math.max(0, logLines.length - maxRecentLogs));
}

function rowToLogLine(row: ReadonlyArray<ResultField>): ApiGwLogLine | undefined {
  const message = normalize(extractFirst(row, ['@message', 'message']));
  if (message === undefined) return undefined;
  return {
    timestamp: normalize(extractFirst(row, ['@timestamp', 'timestamp'])) ?? '',
    message,
  };
}

function extractFirst(row: ReadonlyArray<ResultField>, fields: ReadonlyArray<string>): string | undefined {
  for (const field of fields) {
    const value = extractCwField(row, field);
    if (normalize(value) !== undefined) return value;
  }
  return undefined;
}

function resolveTraceId(vars: ReadonlyMap<string, string>): string | undefined {
  return normalize(vars.get('xRayTraceId')) ?? normalize(vars.get('traceId')) ?? normalize(vars.get('cid'));
}

function resolveTraceIdField(vars: ReadonlyMap<string, string>): string | undefined {
  if (normalize(vars.get('xRayTraceId')) !== undefined) return 'xRayTraceId';
  if (normalize(vars.get('traceId')) !== undefined) return 'traceId';
  if (normalize(vars.get('cid')) !== undefined) return 'cid';
  return undefined;
}

function resolveTraceIdLabel(vars: ReadonlyMap<string, string>): string {
  const field = resolveTraceIdField(vars);
  if (field === 'cid') return 'Correlation ID';
  if (field === 'traceId') return 'Trace ID';
  return 'X-Ray Trace ID';
}

function endpoint(vars: ReadonlyMap<string, string>): string | undefined {
  const method = normalize(vars.get('apiGwHttpMethod'));
  const path = normalize(vars.get('apiGwPath'));
  if (method !== undefined && path !== undefined) return `${method} ${path}`;
  return path ?? method;
}

function authorizerLatencyLabel(vars: ReadonlyMap<string, string>): string | undefined {
  const latency = normalize(vars.get('apiGwAuthorizerLatencyMs')) ?? normalize(vars.get('apiGwAuthorizerLatency'));
  if (latency === undefined) return undefined;
  return `${latency} ms`;
}

function authorizerOutcome(value: string | undefined): ApiGwAuthorizerOutcome | undefined {
  const normalized = normalize(value);
  if (normalized === 'timeout' || normalized === 'error') return normalized;
  if (normalized === 'skipped' || normalized === 'no-error') return normalized;
  return undefined;
}

function splitCsv(value: string | undefined): ReadonlyArray<string> {
  const normalized = normalize(value);
  if (normalized === undefined) return [];
  return normalized
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function parseInteger(value: string | undefined): number | undefined {
  const normalized = normalize(value);
  if (normalized === undefined) return undefined;
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed)) return undefined;
  return parsed;
}

function optionalString<K extends string>(key: K, value: string | undefined): { readonly [P in K]?: string } {
  const normalized = normalize(value);
  return normalized === undefined ? {} : ({ [key]: normalized } as { readonly [P in K]?: string });
}

function optionalNumber<K extends string>(key: K, value: number | undefined): { readonly [P in K]?: number } {
  return value === undefined ? {} : ({ [key]: value } as { readonly [P in K]?: number });
}

function normalize(value: string | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  if (trimmed === '' || trimmed === '-') return undefined;
  return trimmed;
}

function timestampValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function logLineToRecord(logLine: ApiGwLogLine): Readonly<Record<string, string>> {
  return {
    timestamp: logLine.timestamp,
    message: logLine.message,
  };
}
