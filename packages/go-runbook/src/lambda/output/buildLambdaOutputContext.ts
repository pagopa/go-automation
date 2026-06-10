import type { ResultField } from '@go-automation/go-common/aws';

import type { Runbook } from '../../types/Runbook.js';
import type { RunbookExecutionResult } from '../../types/RunbookExecutionResult.js';
import {
  toRunbookOutputDetails,
  type RunbookEvidence,
  type RunbookOutputContext,
  type RunbookResultField,
} from '../../output/RunbookOutputContext.js';
import { extractField } from '../helpers/extractField.js';
import type { LambdaDownstreamOutput, LambdaLogLine, LambdaOutputContext } from './LambdaOutputContext.js';
import { isLambdaRunbookContext } from './LambdaRunbookContext.js';

const DEFAULT_MAX_RECENT_LOGS = 5;

export interface BuildLambdaOutputContextOptions {
  readonly maxRecentLogs?: number;
}

/**
 * Builds the compact result context for a Lambda runbook. Returns
 * `undefined` when the runbook is not a Lambda runbook, so it can be
 * chained after `apigw.buildApiGwOutputContext`.
 *
 * @param runbook - The executed runbook
 * @param result - The engine execution result
 * @param options - Optional limits
 * @returns The output context, or `undefined` for non-Lambda runbooks
 */
export function buildLambdaOutputContext(
  runbook: Runbook,
  result: RunbookExecutionResult,
  options: BuildLambdaOutputContextOptions = {},
): RunbookOutputContext | undefined {
  if (!isLambdaRunbookContext(runbook.runbookContext)) {
    return undefined;
  }

  const maxRecentLogs = options.maxRecentLogs ?? DEFAULT_MAX_RECENT_LOGS;
  const vars = result.finalContext.vars;
  const params = result.finalContext.params;
  const context = runbook.runbookContext;

  const errorRows = readRows(result.finalContext.stepResults.get('query-lambda-errors'));
  const invocationRows = readRows(result.finalContext.stepResults.get('query-lambda-invocation'));
  const recentErrors = extractRecentLogs(errorRows, maxRecentLogs);

  const downstreamTarget = normalize(vars.get('lambdaDownstreamTarget'));
  const downstream = buildDownstream(context.downstreams, downstreamTarget, result, vars, maxRecentLogs);

  const lambdaContext: LambdaOutputContext = {
    alarm: {
      ...optionalString('name', params.get('alarmName')),
      ...optionalString('datetime', params.get('alarmDatetime')),
      ...optionalString('datetimeEnd', params.get('alarmDatetimeEnd')),
      timeRange: {
        ...optionalString('start', params.get('startTime')),
        ...optionalString('end', params.get('endTime')),
      },
    },
    lambda: {
      functionName: vars.get('lambdaFunctionName') ?? context.lambda.name,
      logGroup: vars.get('lambdaLogGroup') ?? context.lambda.logGroup,
      ...optionalString('eventSource', vars.get('lambdaEventSource')),
      ...optionalNumber('configuredTimeoutMs', context.lambda.configuredTimeoutMs),
      ...optionalNumber('errorCount', parseInteger(vars.get('lambdaErrorCount'))),
      ...optionalString('requestId', vars.get('lambdaRequestId')),
      ...optionalString('errorCategory', vars.get('lambdaErrorCategory')),
      ...optionalString('runtimeStatus', vars.get('lambdaRuntimeStatus')),
      ...optionalNumber('durationMs', parseNumber(vars.get('lambdaDurationMs'))),
      ...optionalNumber('billedDurationMs', parseNumber(vars.get('lambdaBilledDurationMs'))),
      ...optionalNumber('memorySizeMb', parseInteger(vars.get('lambdaMemorySizeMb'))),
      ...optionalNumber('maxMemoryUsedMb', parseInteger(vars.get('lambdaMaxMemoryUsedMb'))),
      ...optionalString('errorMessage', vars.get('lastErrorMsg')),
      ...optionalNumber('invocationLogCount', parseInteger(vars.get('lambdaInvocationLogCount'))),
      recentLogs: recentErrors,
    },
    ...(downstream !== undefined ? { downstream } : {}),
  };

  return {
    fields: buildFields(vars, params),
    evidence: buildEvidence(recentErrors, invocationRows, downstream, maxRecentLogs, errorRows.length),
    details: toRunbookOutputDetails(lambdaContext),
  };
}

function buildDownstream(
  downstreams: ReadonlyArray<{ readonly name: string; readonly logGroup?: string; readonly varPrefix: string }>,
  target: string | undefined,
  result: RunbookExecutionResult,
  vars: ReadonlyMap<string, string>,
  maxRecentLogs: number,
): LambdaDownstreamOutput | undefined {
  if (target === undefined) return undefined;
  const declared = downstreams.find((entry) => entry.name === target);
  const rows = readRows(result.finalContext.stepResults.get(`query-${target}`));
  const recentLogs = extractRecentLogs(rows, maxRecentLogs);
  const varPrefix = declared?.varPrefix;
  const errorMessage = varPrefix !== undefined ? normalize(vars.get(`${varPrefix}ErrorMsg`)) : undefined;
  const logCount = varPrefix !== undefined ? parseInteger(vars.get(`${varPrefix}LogCount`)) : undefined;

  return {
    target,
    ...(declared?.logGroup !== undefined ? { logGroup: declared.logGroup } : {}),
    ...(logCount !== undefined ? { logCount } : rows.length > 0 ? { logCount: rows.length } : {}),
    ...(errorMessage !== undefined ? { errorMessage } : {}),
    recentLogs,
  };
}

function buildFields(
  vars: ReadonlyMap<string, string>,
  params: ReadonlyMap<string, string>,
): ReadonlyArray<RunbookResultField> {
  const fields: RunbookResultField[] = [];
  addField(fields, 'alarmName', 'Alarm', params.get('alarmName'));
  addField(fields, 'alarmDatetime', 'Alarm datetime', params.get('alarmDatetime'));
  addField(fields, 'lambda', 'Lambda', vars.get('lambdaFunctionName'));
  addField(fields, 'eventSource', 'Event source', vars.get('lambdaEventSource'));
  addField(fields, 'errorCategory', 'Categoria errore', vars.get('lambdaErrorCategory'));
  addField(fields, 'runtimeStatus', 'Runtime status', vars.get('lambdaRuntimeStatus'));
  addField(fields, 'duration', 'Duration', durationLabel(vars));
  addField(fields, 'memory', 'Memory', memoryLabel(vars));
  addField(fields, 'requestId', 'requestId', vars.get('lambdaRequestId'));
  addField(fields, 'invocationLogCount', 'Invocation log trovati', vars.get('lambdaInvocationLogCount'));
  addField(fields, 'downstreamTarget', 'Downstream', vars.get('lambdaDownstreamTarget'));
  addField(fields, 'lastErrorMsg', 'Ultimo errore', vars.get('lastErrorMsg'));
  return fields;
}

function buildEvidence(
  recentErrors: ReadonlyArray<LambdaLogLine>,
  invocationRows: ReadonlyArray<ReadonlyArray<ResultField>>,
  downstream: LambdaDownstreamOutput | undefined,
  maxRecentLogs: number,
  errorTotalRows: number,
): ReadonlyArray<RunbookEvidence> {
  const evidence: RunbookEvidence[] = [];
  if (recentErrors.length > 0) {
    evidence.push({
      id: 'lambda-recent-errors',
      label: 'Ultimi errori Lambda',
      type: 'log-sample',
      sourceStep: 'query-lambda-errors',
      items: recentErrors.map(logLineToRecord),
      truncated: errorTotalRows > maxRecentLogs,
    });
  }
  const invocationLogs = extractRecentLogs(invocationRows, maxRecentLogs);
  if (invocationLogs.length > 0) {
    evidence.push({
      id: 'lambda-invocation-flow',
      label: 'Flusso invocazione',
      type: 'log-sample',
      sourceStep: 'query-lambda-invocation',
      items: invocationLogs.map(logLineToRecord),
      truncated: invocationRows.length > maxRecentLogs,
    });
  }
  if (downstream !== undefined && downstream.recentLogs.length > 0) {
    evidence.push({
      id: `${downstream.target}-recent-errors`,
      label: `Ultimi log errore ${downstream.target}`,
      type: 'log-sample',
      sourceStep: `query-${downstream.target}`,
      items: downstream.recentLogs.map(logLineToRecord),
      truncated: (downstream.logCount ?? downstream.recentLogs.length) > maxRecentLogs,
    });
  }
  return evidence;
}

function addField(fields: RunbookResultField[], name: string, label: string, value: string | undefined): void {
  const normalized = normalize(value);
  if (normalized === undefined) return;
  fields.push({ name, label, value: normalized });
}

function durationLabel(vars: ReadonlyMap<string, string>): string | undefined {
  const duration = normalize(vars.get('lambdaDurationMs'));
  return duration === undefined ? undefined : `${duration} ms`;
}

function memoryLabel(vars: ReadonlyMap<string, string>): string | undefined {
  const used = normalize(vars.get('lambdaMaxMemoryUsedMb'));
  const size = normalize(vars.get('lambdaMemorySizeMb'));
  if (used === undefined && size === undefined) return undefined;
  return `${used ?? '?'}/${size ?? '?'} MB`;
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
): ReadonlyArray<LambdaLogLine> {
  const logLines = rows
    .map(rowToLogLine)
    .filter((line): line is LambdaLogLine => line !== undefined)
    .sort((a, b) => timestampValue(a.timestamp) - timestampValue(b.timestamp));
  return logLines.slice(Math.max(0, logLines.length - maxRecentLogs));
}

function rowToLogLine(row: ReadonlyArray<ResultField>): LambdaLogLine | undefined {
  const message = normalize(extractFirst(row, ['@message', 'message']));
  if (message === undefined) return undefined;
  return {
    timestamp: normalize(extractFirst(row, ['@timestamp', 'timestamp'])) ?? '',
    message,
  };
}

function extractFirst(row: ReadonlyArray<ResultField>, fields: ReadonlyArray<string>): string | undefined {
  for (const field of fields) {
    const value = extractField(row, field);
    if (normalize(value) !== undefined) return value;
  }
  return undefined;
}

function parseInteger(value: string | undefined): number | undefined {
  const normalized = normalize(value);
  if (normalized === undefined) return undefined;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  const normalized = normalize(value);
  if (normalized === undefined) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
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

function logLineToRecord(logLine: LambdaLogLine): Readonly<Record<string, string>> {
  return { timestamp: logLine.timestamp, message: logLine.message };
}
