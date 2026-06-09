import type { ResultField } from '@go-automation/go-common/aws';

import type { Runbook } from '../../types/Runbook.js';
import type { RunbookExecutionResult } from '../../types/RunbookExecutionResult.js';
import type { RunbookEvidence, RunbookOutputContext, RunbookResultField } from '../../output/RunbookOutputContext.js';
import { extractFirst } from './extractFirst.js';
import type { ServiceLogLine, ServiceOutputContext } from './ServiceOutputContext.js';
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

  const errorRows = readRows(result.finalContext.stepResults.get(`query-${service.name}`));
  const traceRows = readRows(result.finalContext.stepResults.get(`query-${service.name}-trace`));
  const recentLogs = extractRecentLogs(errorRows, maxRecentLogs);
  const traceLogs = extractRecentLogs(traceRows, maxRecentLogs);

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
    details: details as unknown as Readonly<Record<string, unknown>>,
  };
}

function buildFields(
  serviceName: string,
  varPrefix: string,
  vars: ReadonlyMap<string, string>,
  params: ReadonlyMap<string, string>,
): ReadonlyArray<RunbookResultField> {
  const fields: RunbookResultField[] = [];
  addField(fields, 'alarmName', 'Alarm', params.get('alarmName'));
  addField(fields, 'alarmDatetime', 'Alarm datetime', params.get('alarmDatetime'));
  addField(fields, 'service', 'Servizio', serviceName);
  addField(fields, 'errorCount', 'Log errore', vars.get(`${varPrefix}LogCount`));
  addField(fields, 'traceId', 'trace_id', vars.get(`${varPrefix}TraceId`));
  addField(fields, 'traceLogCount', 'Log trace', vars.get(`${varPrefix}TraceLogCount`));
  addField(fields, 'fallbackUuid', 'Fallback UUID', vars.get(`${varPrefix}FallbackUuid`));
  addField(fields, 'lastErrorMsg', 'Ultimo errore', vars.get(`${varPrefix}ErrorMsg`));
  return fields;
}

function buildEvidence(
  serviceName: string,
  recentLogs: ReadonlyArray<ServiceLogLine>,
  traceLogs: ReadonlyArray<ServiceLogLine>,
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

function addField(fields: RunbookResultField[], name: string, label: string, value: string | undefined): void {
  const normalized = normalize(value);
  if (normalized === undefined) return;
  fields.push({ name, label, value: normalized });
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
): ReadonlyArray<ServiceLogLine> {
  const logLines = rows
    .map(rowToLogLine)
    .filter((line): line is ServiceLogLine => line !== undefined)
    .sort((a, b) => timestampValue(a.timestamp) - timestampValue(b.timestamp));
  return logLines.slice(Math.max(0, logLines.length - maxRecentLogs));
}

function rowToLogLine(row: ReadonlyArray<ResultField>): ServiceLogLine | undefined {
  const message = normalize(extractFirst(row, ['@message', 'message']));
  if (message === undefined) return undefined;
  return {
    timestamp: normalize(extractFirst(row, ['@timestamp', 'timestamp'])) ?? '',
    message,
  };
}

function logLineToRecord(line: ServiceLogLine): Readonly<Record<string, string>> {
  return {
    timestamp: line.timestamp,
    message: line.message,
  };
}

function optionalString(key: string, value: string | undefined): Record<string, string> {
  const normalized = normalize(value);
  return normalized === undefined ? {} : { [key]: normalized };
}

function optionalNumber(key: string, value: number | undefined): Record<string, number> {
  return value === undefined ? {} : { [key]: value };
}

function parseInteger(value: string | undefined): number | undefined {
  const normalized = normalize(value);
  if (normalized === undefined) return undefined;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function timestampValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
