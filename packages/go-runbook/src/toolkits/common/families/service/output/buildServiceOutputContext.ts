import { readResultFieldRows } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { parseInteger } from '@pagopa/go-common/utils';
import type { Runbook, RunbookExecutionResult } from '../../../../../engine/index.js';
import type { LogLine } from '../../../parsing/aws/cloudwatch-logs/LogLine.js';
import { toRunbookOutputDetails, type RunbookOutputContext } from '../../../output/RunbookOutputContext.js';
import type { RunbookEvidence } from '../../../output/RunbookEvidence.js';
import type { RunbookResultField } from '../../../output/RunbookResultField.js';
import { buildAlarmOutput } from '../../../output/buildAlarmOutput.js';
import { addResultField, optionalNumber, optionalString } from '../../../output/outputValues.js';
import { extractRecentLogLines } from '../../../parsing/aws/cloudwatch-logs/resultRows.js';
import { DEFAULT_MAX_RECENT_LOGS } from '../../../output/DEFAULT_MAX_RECENT_LOGS.js';
import type { LogSampleOptions } from '../../../output/LogSampleOptions.js';
import { logSampleEvidence } from '../../../output/logSampleEvidence.js';
import type { ServiceOutputContext } from './ServiceOutputContext.js';
import { isServiceRunbookContext } from './ServiceRunbookContext.js';
import { representativeContext } from '../../../output/resultContexts.js';
import { ErrorTreeView } from '../../../output/tree/ErrorTreeView.js';

/**
 * Builds the output context of a service runbook: the service, its errors and its trace.
 *
 * @param runbook - The executed runbook
 * @param result - Result of the execution
 * @param options - Bounds of the log samples
 * @returns The output context, or `undefined` when the runbook is not a service runbook
 */
export function buildServiceOutputContext(
  runbook: Runbook,
  result: RunbookExecutionResult,
  options: LogSampleOptions = {},
): RunbookOutputContext | undefined {
  if (!isServiceRunbookContext(runbook.runbookContext)) {
    return undefined;
  }
  const context = representativeContext(result, new ErrorTreeView(result));

  const maxRecentLogs = options.maxRecentLogs ?? DEFAULT_MAX_RECENT_LOGS;
  const { service } = runbook.runbookContext;
  const vars = context.vars;
  const params = context.params;

  const errorRows = readResultFieldRows(context.stepResults.get(`query-${service.name}`));
  const traceRows = readResultFieldRows(context.stepResults.get(`query-${service.name}-trace`));
  const recentLogs = extractRecentLogLines(errorRows, maxRecentLogs);
  const traceLogs = extractRecentLogLines(traceRows, maxRecentLogs);
  const evidence = buildEvidence(
    service.name,
    recentLogs,
    traceLogs,
    errorRows.length,
    traceRows.length,
    maxRecentLogs,
  );

  const details: ServiceOutputContext = {
    alarm: buildAlarmOutput(params),
    service: {
      name: service.name,
      logGroup: service.logGroup,
      ...optionalNumber('errorCount', parseInteger(vars.get(`${service.varPrefix}LogCount`))),
      ...optionalString('traceId', vars.get(`${service.varPrefix}TraceId`)),
      ...optionalString('fallbackUuid', vars.get(`${service.varPrefix}FallbackUuid`)),
      ...optionalString('errorMessage', vars.get(`${service.varPrefix}ErrorMsg`)),
      ...optionalNumber('traceLogCount', parseInteger(vars.get(`${service.varPrefix}TraceLogCount`))),
      recentLogs,
      traceLogs,
    },
  };

  return {
    fields: buildFields(service.name, service.varPrefix, vars, params),
    evidence,
    details: toRunbookOutputDetails(details),
  };
}

function buildFields(
  serviceName: string,
  varPrefix: string,
  vars: ReadonlyMap<string, string>,
  params: ReadonlyMap<string, string>,
): ReadonlyArray<RunbookResultField> {
  const fields: RunbookResultField[] = [];
  addResultField(fields, 'alarmName', 'Alarm', params.get('alarmName'));
  addResultField(fields, 'alarmDatetime', 'Alarm datetime', params.get('alarmDatetime'));
  addResultField(fields, 'service', 'Servizio', serviceName);
  addResultField(fields, 'errorCount', 'Log errore', vars.get(`${varPrefix}LogCount`));
  addResultField(fields, 'traceId', 'trace_id', vars.get(`${varPrefix}TraceId`));
  addResultField(fields, 'traceLogCount', 'Log trace', vars.get(`${varPrefix}TraceLogCount`));
  addResultField(fields, 'fallbackUuid', 'Fallback UUID', vars.get(`${varPrefix}FallbackUuid`));
  addResultField(fields, 'lastErrorMsg', 'Ultimo errore', vars.get(`${varPrefix}ErrorMsg`));
  return fields;
}

function buildEvidence(
  serviceName: string,
  recentLogs: ReadonlyArray<LogLine>,
  traceLogs: ReadonlyArray<LogLine>,
  totalErrorRows: number,
  totalTraceRows: number,
  maxRecentLogs: number,
): ReadonlyArray<RunbookEvidence> {
  return [
    ...logSampleEvidence(
      {
        id: `${serviceName}-recent-errors`,
        label: `Ultimi log errore ${serviceName}`,
        sourceStep: `query-${serviceName}`,
        logs: recentLogs,
        totalRows: totalErrorRows,
      },
      maxRecentLogs,
    ),
    ...logSampleEvidence(
      {
        id: `${serviceName}-trace-logs`,
        label: `Log correlati al trace ${serviceName}`,
        sourceStep: `query-${serviceName}-trace`,
        logs: traceLogs,
        totalRows: totalTraceRows,
      },
      maxRecentLogs,
    ),
  ];
}
