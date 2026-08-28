import { parseFiniteNumber, parseInteger } from '@go-automation/go-common/core';
import { readResultFieldRows } from '@go-automation/go-common/aws';
import type { LogLine } from '../../output/LogLine.js';
import type { ResultField } from '@go-automation/go-common/aws';

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
import type { LambdaDownstreamOutput, LambdaOutputContext } from './LambdaOutputContext.js';
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

  const errorRows = readResultFieldRows(result.finalContext.stepResults.get('query-lambda-errors'));
  const invocationRows = readResultFieldRows(result.finalContext.stepResults.get('query-lambda-invocation'));
  const recentErrors = extractRecentLogLines(errorRows, maxRecentLogs);

  const downstreamTarget = normalizeOutputValue(vars.get('lambdaDownstreamTarget'));
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
      ...optionalNumber('durationMs', parseFiniteNumber(vars.get('lambdaDurationMs'))),
      ...optionalNumber('billedDurationMs', parseFiniteNumber(vars.get('lambdaBilledDurationMs'))),
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
  const rows = readResultFieldRows(result.finalContext.stepResults.get(`query-${target}`));
  const recentLogs = extractRecentLogLines(rows, maxRecentLogs);
  const varPrefix = declared?.varPrefix;
  const errorMessage = varPrefix !== undefined ? normalizeOutputValue(vars.get(`${varPrefix}ErrorMsg`)) : undefined;
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
  addResultField(fields, 'alarmName', 'Alarm', params.get('alarmName'));
  addResultField(fields, 'alarmDatetime', 'Alarm datetime', params.get('alarmDatetime'));
  addResultField(fields, 'lambda', 'Lambda', vars.get('lambdaFunctionName'));
  addResultField(fields, 'eventSource', 'Event source', vars.get('lambdaEventSource'));
  addResultField(fields, 'errorCategory', 'Categoria errore', vars.get('lambdaErrorCategory'));
  addResultField(fields, 'runtimeStatus', 'Runtime status', vars.get('lambdaRuntimeStatus'));
  addResultField(fields, 'duration', 'Duration', durationLabel(vars));
  addResultField(fields, 'memory', 'Memory', memoryLabel(vars));
  addResultField(fields, 'requestId', 'requestId', vars.get('lambdaRequestId'));
  addResultField(fields, 'invocationLogCount', 'Invocation log trovati', vars.get('lambdaInvocationLogCount'));
  addResultField(fields, 'downstreamTarget', 'Downstream', vars.get('lambdaDownstreamTarget'));
  addResultField(fields, 'lastErrorMsg', 'Ultimo errore', vars.get('lastErrorMsg'));
  return fields;
}

function buildEvidence(
  recentErrors: ReadonlyArray<LogLine>,
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
  const invocationLogs = extractRecentLogLines(invocationRows, maxRecentLogs);
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

function durationLabel(vars: ReadonlyMap<string, string>): string | undefined {
  const duration = normalizeOutputValue(vars.get('lambdaDurationMs'));
  return duration === undefined ? undefined : `${duration} ms`;
}

function memoryLabel(vars: ReadonlyMap<string, string>): string | undefined {
  const used = normalizeOutputValue(vars.get('lambdaMaxMemoryUsedMb'));
  const size = normalizeOutputValue(vars.get('lambdaMemorySizeMb'));
  if (used === undefined && size === undefined) return undefined;
  return `${used ?? '?'}/${size ?? '?'} MB`;
}
