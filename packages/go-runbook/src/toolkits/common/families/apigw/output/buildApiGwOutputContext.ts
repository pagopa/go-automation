import { readResultFieldRows } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { parseInteger } from '@pagopa/go-common/utils';
import type { LogLine } from '../../../parsing/aws/cloudwatch-logs/LogLine.js';
import type { Runbook, RunbookExecutionResult } from '../../../../../engine/index.js';
import { toRunbookOutputDetails, type RunbookOutputContext } from '../../../output/RunbookOutputContext.js';
import type { RunbookEvidence } from '../../../output/RunbookEvidence.js';
import type { RunbookResultField } from '../../../output/RunbookResultField.js';
import { buildAlarmOutput } from '../../../output/buildAlarmOutput.js';
import { addResultField, optionalNumber, optionalString, normalizeOutputValue } from '../../../output/outputValues.js';
import { extractRecentLogLines } from '../../../parsing/aws/cloudwatch-logs/resultRows.js';
import { DEFAULT_MAX_RECENT_LOGS } from '../../../output/DEFAULT_MAX_RECENT_LOGS.js';
import type { LogSampleOptions } from '../../../output/LogSampleOptions.js';
import { logSampleEvidence } from '../../../output/logSampleEvidence.js';
import type { ApiGwOutputContext } from './ApiGwOutputContext.js';
import type { ApiGwAuthorizerOutcome } from './ApiGwAuthorizerOutcome.js';
import type { ApiGwAuthorizerOutput } from './ApiGwAuthorizerOutput.js';
import type { ApiGwExecutionLogsOutput } from './ApiGwExecutionLogsOutput.js';
import type { ApiGwServiceOutput } from './ApiGwServiceOutput.js';
import { isApiGwRunbookContext } from './ApiGwRunbookContext.js';
import { representativeContext } from '../../../output/resultContexts.js';
import { ErrorTreeView } from '../../../output/tree/ErrorTreeView.js';

/**
 * Builds the output context of an API Gateway runbook: access log, authorizer, execution log and services.
 *
 * @param runbook - The executed runbook
 * @param result - Result of the execution
 * @param options - Bounds of the log samples
 * @returns The output context, or `undefined` when the runbook is not an API Gateway runbook
 */
export function buildApiGwOutputContext(
  runbook: Runbook,
  result: RunbookExecutionResult,
  options: LogSampleOptions = {},
): RunbookOutputContext | undefined {
  if (!isApiGwRunbookContext(runbook.runbookContext)) {
    return undefined;
  }
  const context = representativeContext(result, new ErrorTreeView(result));

  const maxRecentLogs = options.maxRecentLogs ?? DEFAULT_MAX_RECENT_LOGS;
  const vars = context.vars;
  const params = context.params;
  const accessLogRows = readResultFieldRows(context.stepResults.get('query-api-gw-logs'));
  const apiGwRecentLogs = extractRecentLogLines(accessLogRows, maxRecentLogs);
  const serviceContexts = runbook.runbookContext.services.map((service) => {
    const serviceRows = readResultFieldRows(context.stepResults.get(`query-${service.name}`));
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

  const { traceIdVar } = runbook.runbookContext;
  const traceId = traceIdVar === undefined ? undefined : normalizeOutputValue(vars.get(traceIdVar));
  const apiGwContext: ApiGwOutputContext = {
    alarm: buildAlarmOutput(params),
    apiGateway: {
      logGroup: runbook.runbookContext.apiGwLogGroup,
      ...optionalNumber('errorCount', parseInteger(vars.get('apiGwErrorCount'))),
      ...optionalString('statusCode', vars.get('apiGwStatusCode')),
      ...optionalString('httpMethod', vars.get('apiGwHttpMethod')),
      ...optionalString('path', vars.get('apiGwPath')),
      ...optionalString('sourceIp', vars.get('apiGwSourceIp')),
      ...optionalString('traceId', traceId),
      ...optionalString('traceIdField', traceId === undefined ? undefined : traceIdVar),
      ...optionalString('fallbackUuid', vars.get('fallbackUuid')),
      ...optionalString('errorMessage', vars.get('apiGwErrorMessage')),
      recentLogs: apiGwRecentLogs,
    },
    ...optionalAuthorizer(vars),
    ...optionalExecutionLogs(vars),
    services: serviceContexts,
  };

  return {
    fields: buildFields(vars, params, { label: runbook.runbookContext.traceIdLabel ?? 'Trace ID', value: traceId }),
    evidence: buildEvidence(apiGwRecentLogs, serviceContexts, maxRecentLogs, accessLogRows.length),
    details: toRunbookOutputDetails(apiGwContext),
  };
}

function buildFields(
  vars: ReadonlyMap<string, string>,
  params: ReadonlyMap<string, string>,
  traceId: { readonly label: string; readonly value: string | undefined },
): ReadonlyArray<RunbookResultField> {
  const fields: RunbookResultField[] = [];
  addResultField(fields, 'alarmName', 'Alarm', params.get('alarmName'));
  addResultField(fields, 'alarmDatetime', 'Alarm datetime', params.get('alarmDatetime'));
  addResultField(fields, 'endpoint', 'Endpoint', endpoint(vars));
  addResultField(fields, 'apiGwStatusCode', 'API Gateway status', vars.get('apiGwStatusCode'));
  addResultField(fields, 'apiGwSourceIp', 'Source IP', vars.get('apiGwSourceIp'));
  addResultField(fields, 'apiGwErrorMessage', 'API Gateway error message', vars.get('apiGwErrorMessage'));
  addResultField(fields, 'traceId', traceId.label, traceId.value);
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
  return fields;
}

function buildEvidence(
  apiGwRecentLogs: ReadonlyArray<LogLine>,
  services: ReadonlyArray<ApiGwServiceOutput>,
  maxRecentLogs: number,
  apiGwTotalRows: number,
): ReadonlyArray<RunbookEvidence> {
  return [
    ...logSampleEvidence(
      {
        id: 'api-gw-recent-logs',
        label: 'Ultimi log API Gateway',
        sourceStep: 'query-api-gw-logs',
        logs: apiGwRecentLogs,
        totalRows: apiGwTotalRows,
      },
      maxRecentLogs,
    ),
    ...services.flatMap((service) =>
      logSampleEvidence(
        {
          id: `${service.name}-recent-errors`,
          label: `Ultimi log errore ${service.name}`,
          sourceStep: `query-${service.name}`,
          logs: service.recentLogs,
          totalRows: service.logCount,
        },
        maxRecentLogs,
      ),
    ),
  ];
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
