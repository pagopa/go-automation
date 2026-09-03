import { parseInteger } from '@go-automation/go-common/core';
import { readResultFieldRows } from '@go-automation/go-common/aws';
import type { Runbook } from '../../types/Runbook.js';
import type { RunbookExecutionResult } from '../../types/RunbookExecutionResult.js';
import type { LogLine } from '../../output/LogLine.js';
import {
  toRunbookOutputDetails,
  type RunbookEvidence,
  type RunbookOutputContext,
  type RunbookResultField,
} from '../../output/RunbookOutputContext.js';
import { addResultField, optionalNumber, optionalString } from '../../output/outputValues.js';
import { extractRecentLogLines, logLineToRecord } from '../../output/resultRows.js';
import type { ServiceOutputContext } from './ServiceOutputContext.js';
import { isServiceRunbookContext } from './ServiceRunbookContext.js';

const DEFAULT_MAX_RECENT_LOGS = 5;

export interface BuildServiceOutputContextOptions {
  readonly maxRecentLogs?: number;
}

export function buildServiceOutputContext(
  runbook: Runbook,
  result: RunbookExecutionResult,
  options: BuildServiceOutputContextOptions = {},
): RunbookOutputContext | undefined {
  if (!isServiceRunbookContext(runbook.runbookContext)) {
    return undefined;
  }

  const maxRecentLogs = options.maxRecentLogs ?? DEFAULT_MAX_RECENT_LOGS;
  const { service } = runbook.runbookContext;
  const vars = result.finalContext.vars;
  const params = result.finalContext.params;

  const errorRows = readResultFieldRows(result.finalContext.stepResults.get(`query-${service.name}`));
  const traceRows = readResultFieldRows(result.finalContext.stepResults.get(`query-${service.name}-trace`));
  const recentLogs = extractRecentLogLines(errorRows, maxRecentLogs);
  const traceLogs = extractRecentLogLines(traceRows, maxRecentLogs);

  const details: ServiceOutputContext = {
    alarm: {
      ...optionalString('name', params.get('alarmName')),
      ...optionalString('datetime', params.get('alarmDatetime')),
      ...optionalString('datetimeEnd', params.get('alarmDatetimeEnd')),
      timeRange: {
        ...optionalString('start', params.get('startTime')),
        ...optionalString('end', params.get('endTime')),
      },
    },
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
    evidence: buildEvidence(service.name, recentLogs, traceLogs, errorRows.length, traceRows.length, maxRecentLogs),
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
  const evidence: RunbookEvidence[] = [];
  if (recentLogs.length > 0) {
    evidence.push({
      id: `${serviceName}-recent-errors`,
      label: `Ultimi log errore ${serviceName}`,
      type: 'log-sample',
      sourceStep: `query-${serviceName}`,
      items: recentLogs.map(logLineToRecord),
      truncated: totalErrorRows > maxRecentLogs,
    });
  }
  if (traceLogs.length > 0) {
    evidence.push({
      id: `${serviceName}-trace-logs`,
      label: `Log correlati al trace ${serviceName}`,
      type: 'log-sample',
      sourceStep: `query-${serviceName}-trace`,
      items: traceLogs.map(logLineToRecord),
      truncated: totalTraceRows > maxRecentLogs,
    });
  }
  return evidence;
}
