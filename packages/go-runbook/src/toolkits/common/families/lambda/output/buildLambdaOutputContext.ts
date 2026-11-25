import { readResultFieldRows } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { omitUndefined, parseFiniteNumber, parseInteger } from '@pagopa/go-common/utils';
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
import type { LambdaOutputContext } from './LambdaOutputContext.js';
import type { LambdaDownstreamOutput } from './LambdaDownstreamOutput.js';
import { isLambdaRunbookContext } from './LambdaRunbookContext.js';
import { representativeContext } from '../../../output/resultContexts.js';
import { ErrorTreeView } from '../../../output/tree/ErrorTreeView.js';
import type { CloudWatchLogsRows } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';

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
  options: LogSampleOptions = {},
): RunbookOutputContext | undefined {
  if (!isLambdaRunbookContext(runbook.runbookContext)) {
    return undefined;
  }
  const executionContext = representativeContext(result, new ErrorTreeView(result));

  const maxRecentLogs = options.maxRecentLogs ?? DEFAULT_MAX_RECENT_LOGS;
  const vars = executionContext.vars;
  const params = executionContext.params;
  const context = runbook.runbookContext;

  const errorRows = readResultFieldRows(executionContext.stepResults.get('query-lambda-errors'));
  const invocationRows = readResultFieldRows(executionContext.stepResults.get('query-lambda-invocation'));
  const recentErrors = extractRecentLogLines(errorRows, maxRecentLogs);

  const downstreamTarget = normalizeOutputValue(vars.get('lambdaDownstreamTarget'));
  const downstream = buildDownstream(
    context.downstreams,
    downstreamTarget,
    executionContext.stepResults,
    vars,
    maxRecentLogs,
  );

  const lambdaContext: LambdaOutputContext = {
    alarm: buildAlarmOutput(params),
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
  stepResults: ReadonlyMap<string, unknown>,
  vars: ReadonlyMap<string, string>,
  maxRecentLogs: number,
): LambdaDownstreamOutput | undefined {
  if (target === undefined) return undefined;
  const declared = downstreams.find((entry) => entry.name === target);
  const rows = readResultFieldRows(stepResults.get(`query-${target}`));
  const recentLogs = extractRecentLogLines(rows, maxRecentLogs);
  const varPrefix = declared?.varPrefix;
  const errorMessage = varPrefix !== undefined ? normalizeOutputValue(vars.get(`${varPrefix}ErrorMsg`)) : undefined;
  const logCount = varPrefix !== undefined ? parseInteger(vars.get(`${varPrefix}LogCount`)) : undefined;

  return {
    target,
    ...omitUndefined({
      logGroup: declared?.logGroup,
      logCount: logCount ?? (rows.length > 0 ? rows.length : undefined),
      errorMessage,
    }),
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
  invocationRows: CloudWatchLogsRows,
  downstream: LambdaDownstreamOutput | undefined,
  maxRecentLogs: number,
  errorTotalRows: number,
): ReadonlyArray<RunbookEvidence> {
  return [
    ...logSampleEvidence(
      {
        id: 'lambda-recent-errors',
        label: 'Ultimi errori Lambda',
        sourceStep: 'query-lambda-errors',
        logs: recentErrors,
        totalRows: errorTotalRows,
      },
      maxRecentLogs,
    ),
    ...logSampleEvidence(
      {
        id: 'lambda-invocation-flow',
        label: 'Flusso invocazione',
        sourceStep: 'query-lambda-invocation',
        logs: extractRecentLogLines(invocationRows, maxRecentLogs),
        totalRows: invocationRows.length,
      },
      maxRecentLogs,
    ),
    ...(downstream === undefined
      ? []
      : logSampleEvidence(
          {
            id: `${downstream.target}-recent-errors`,
            label: `Ultimi log errore ${downstream.target}`,
            sourceStep: `query-${downstream.target}`,
            logs: downstream.recentLogs,
            totalRows: downstream.logCount ?? downstream.recentLogs.length,
          },
          maxRecentLogs,
        )),
  ];
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
