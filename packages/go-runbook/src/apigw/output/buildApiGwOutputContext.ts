import { parseInteger } from '@go-automation/go-common/core';
import { readResultFieldRows } from '@go-automation/go-common/aws';
import type { LogLine } from '../../output/LogLine.js';
import type { Runbook } from '../../types/Runbook.js';
import type { RunbookExecutionResult } from '../../types/RunbookExecutionResult.js';
import {
  toRunbookOutputDetails,
  type RunbookEvidence,
  type RunbookOutputContext,
  type RunbookResultField,
} from '../../output/RunbookOutputContext.js';
import { addResultField, optionalNumber, optionalString, normalizeOutputValue } from '../../output/outputValues.js';
import { extractRecentLogLines, logLineToRecord } from '../../output/resultRows.js';
import type {
  ApiGwAuthorizerOutcome,
  ApiGwAuthorizerOutput,
  ApiGwExecutionLogsOutput,
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
  const accessLogRows = readResultFieldRows(result.finalContext.stepResults.get('query-api-gw-logs'));
  const apiGwRecentLogs = extractRecentLogLines(accessLogRows, maxRecentLogs);
  const serviceContexts = runbook.runbookContext.services.map((service) => {
    const serviceRows = readResultFieldRows(result.finalContext.stepResults.get(`query-${service.name}`));
    return {
      name: service.name,
      logGroup: service.logGroup,
      logCount: parseInteger(vars.get(`${service.varPrefix}LogCount`)) ?? serviceRows.length,
      ...optionalString('errorMessage', vars.get(`${service.varPrefix}ErrorMsg`)),
      ...optionalString('knownUrl', vars.get(`${service.varPrefix}NextUrl`)),
      ...optionalString('knownUrlTarget', vars.get(`${service.varPrefix}NextUrlTarget`)),
      recentLogs: extractRecentLogLines(serviceRows, maxRecentLogs),
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
      ...optionalString('sourceIp', vars.get('apiGwSourceIp')),
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
    details: toRunbookOutputDetails(apiGwContext),
  };
}

function buildFields(
  vars: ReadonlyMap<string, string>,
  params: ReadonlyMap<string, string>,
): ReadonlyArray<RunbookResultField> {
  const fields: RunbookResultField[] = [];
  addResultField(fields, 'alarmName', 'Alarm', params.get('alarmName'));
  addResultField(fields, 'alarmDatetime', 'Alarm datetime', params.get('alarmDatetime'));
  addResultField(fields, 'endpoint', 'Endpoint', endpoint(vars));
  addResultField(fields, 'apiGwStatusCode', 'API Gateway status', vars.get('apiGwStatusCode'));
  addResultField(fields, 'apiGwSourceIp', 'Source IP', vars.get('apiGwSourceIp'));
  addResultField(fields, 'apiGwErrorMessage', 'API Gateway error message', vars.get('apiGwErrorMessage'));
  addResultField(fields, 'traceId', resolveTraceIdLabel(vars), resolveTraceId(vars));
  addResultField(fields, 'fallbackUuid', 'Fallback UUID', vars.get('fallbackUuid'));
  addResultField(fields, 'authorizerLambda', 'Lambda authorizer', vars.get('apiGwAuthorizerLambdaName'));
  addResultField(fields, 'authorizerStatus', 'authorizerStatus', vars.get('apiGwAuthorizerStatus'));
  addResultField(fields, 'authorizerLatency', 'authorizerLatency', authorizerLatencyLabel(vars));
  addResultField(fields, 'authorizerRequestId', 'authorizerRequestId', vars.get('apiGwAuthorizerRequestId'));
  addResultField(fields, 'executionLogMode', 'Execution log mode', vars.get('apiGwExecutionLogMode'));
  addResultField(fields, 'executionLogCount', 'Execution log trovati', vars.get('apiGwExecutionLogCount'));
  addResultField(
    fields,
    'executionLogUnavailableReason',
    'Motivo execution log non disponibili',
    vars.get('apiGwExecutionLogUnavailableReason'),
  );
  addResultField(fields, 'lastErrorMsg', 'Ultimo errore', vars.get('lastErrorMsg'));
  addResultField(fields, 'servicesVisited', 'Servizi analizzati', vars.get('apiGwServicesVisited'));
  return fields;
}

function buildEvidence(
  apiGwRecentLogs: ReadonlyArray<LogLine>,
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

function optionalAuthorizer(vars: ReadonlyMap<string, string>): {
  readonly authorizer?: ApiGwAuthorizerOutput;
} {
  const lambdaName = normalizeOutputValue(vars.get('apiGwAuthorizerLambdaName'));
  const status = normalizeOutputValue(vars.get('apiGwAuthorizerStatus'));
  const latencyMs =
    parseInteger(vars.get('apiGwAuthorizerLatencyMs')) ?? parseInteger(vars.get('apiGwAuthorizerLatency'));
  const requestId = normalizeOutputValue(vars.get('apiGwAuthorizerRequestId'));
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
  const mode = normalizeOutputValue(vars.get('apiGwExecutionLogMode'));
  const logGroup = normalizeOutputValue(vars.get('apiGwExecutionLogGroup'));
  const requestCount = parseInteger(vars.get('apiGwExecutionLogRequestCount'));
  const logCount = parseInteger(vars.get('apiGwExecutionLogCount'));
  const unavailableReason = normalizeOutputValue(vars.get('apiGwExecutionLogUnavailableReason'));
  const requestIds = splitCsv(vars.get('apiGwExecutionLogRequestIds'));
  const paths = splitCsv(vars.get('apiGwExecutionLogPaths'));

  if (
    mode === undefined &&
    logGroup === undefined &&
    requestCount === undefined &&
    logCount === undefined &&
    unavailableReason === undefined &&
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
      ...optionalString('unavailableReason', unavailableReason),
      requestIds: requestIds.map((requestId, index) => ({
        requestId,
        ...optionalString('path', paths[index]),
      })),
    },
  };
}

function resolveTraceId(vars: ReadonlyMap<string, string>): string | undefined {
  return (
    normalizeOutputValue(vars.get('xRayTraceId')) ??
    normalizeOutputValue(vars.get('traceId')) ??
    normalizeOutputValue(vars.get('cid'))
  );
}

function resolveTraceIdField(vars: ReadonlyMap<string, string>): string | undefined {
  if (normalizeOutputValue(vars.get('xRayTraceId')) !== undefined) return 'xRayTraceId';
  if (normalizeOutputValue(vars.get('traceId')) !== undefined) return 'traceId';
  if (normalizeOutputValue(vars.get('cid')) !== undefined) return 'cid';
  return undefined;
}

function resolveTraceIdLabel(vars: ReadonlyMap<string, string>): string {
  const field = resolveTraceIdField(vars);
  if (field === 'cid') return 'Correlation ID';
  if (field === 'traceId') return 'Trace ID';
  return 'X-Ray Trace ID';
}

function endpoint(vars: ReadonlyMap<string, string>): string | undefined {
  const method = normalizeOutputValue(vars.get('apiGwHttpMethod'));
  const path = normalizeOutputValue(vars.get('apiGwPath'));
  if (method !== undefined && path !== undefined) return `${method} ${path}`;
  return path ?? method;
}

function authorizerLatencyLabel(vars: ReadonlyMap<string, string>): string | undefined {
  const latency =
    normalizeOutputValue(vars.get('apiGwAuthorizerLatencyMs')) ??
    normalizeOutputValue(vars.get('apiGwAuthorizerLatency'));
  if (latency === undefined) return undefined;
  return `${latency} ms`;
}

function authorizerOutcome(value: string | undefined): ApiGwAuthorizerOutcome | undefined {
  const normalized = normalizeOutputValue(value);
  if (normalized === 'timeout' || normalized === 'error') return normalized;
  if (normalized === 'skipped' || normalized === 'no-error') return normalized;
  return undefined;
}

function splitCsv(value: string | undefined): ReadonlyArray<string> {
  const normalized = normalizeOutputValue(value);
  if (normalized === undefined) return [];
  return normalized
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}
