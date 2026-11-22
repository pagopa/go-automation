/**
 * Helpers to execute an INTEROP runbook end to end against a scripted fake
 * of CloudWatch Logs.
 */
import type { Runbook } from '../../../../../engine/types/Runbook.js';
import { executeWithLogs } from '../../../../../__tests__/helpers/executeWithLogs.js';
import type { LogRows } from '../../../../../__tests__/helpers/LogRows.js';
import type { LogsResponderFn } from '../../../../../__tests__/helpers/LogsResponderFn.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';
import type { InteropPodLogScenario } from './InteropPodLogScenario.js';

/** Default occurrence window of the executions. */
const DEFAULT_WINDOW: Readonly<Record<string, string>> = {
  startTime: '2026-10-01T09:55:00.000Z',
  endTime: '2026-10-01T10:01:00.000Z',
};

/**
 * Whether a query is the CID tracker one.
 *
 * @param query - Logs Insights query
 * @returns True for the CID tracker query
 *
 * @example
 * ```typescript
 * const tracked = queries.filter(({ query }) => isCidTrackerQuery(query));
 * ```
 */
export function isCidTrackerQuery(query: string): boolean {
  return query.includes('filter cid in [');
}

/**
 * The CIDs a CID tracker query filters on.
 *
 * @param query - Logs Insights query
 * @returns The CIDs, in the order of the query; none for another query
 *
 * @example
 * ```typescript
 * trackedCids('parse @message "[CID=*]" as cid | filter cid in ["a", "b"]'); // ['a', 'b']
 * ```
 */
export function trackedCids(query: string): ReadonlyArray<string> {
  const list = /filter cid in \[([^\]]*)\]/u.exec(query)?.[1] ?? '';
  return [...list.matchAll(/"([^"]+)"/gu)].map((match) => match[1] ?? '');
}

/**
 * The rows a CID tracker query returns when every CID it filters on has `rows`: each copy carries the `cid` field
 * the query extracts.
 *
 * @param query - CID tracker query
 * @param rows - Rows of each CID
 * @returns The rows of every CID of the query
 *
 * @example
 * ```typescript
 * const rows = cidTrackerRows(query, [[{ field: '@message', value: 'ERROR - boom' }]]);
 * ```
 */
export function cidTrackerRows(query: string, rows: LogRows): LogRows {
  return trackedCids(query).flatMap((cid) => rows.map((row) => [...row, { field: 'cid', value: cid }]));
}

/**
 * Executes a runbook for one alarm with `executeWithLogs`, answering every
 * Logs Insights query with `respond`.
 *
 * @param runbook - Runbook to execute
 * @param alarmName - Alarm that fired
 * @param respond - Rows of each query
 * @param params - Parameters besides `alarmName`; by default the occurrence window
 * @returns The execution, its analysis draft, the matched case ids and the queries sent
 *
 * @example
 * ```typescript
 * const { matchedIds } = await executeAlarmWithLogs(buildRunbook(), ALARM_NAME, interopPodResponder(scenario));
 * ```
 */
export async function executeAlarmWithLogs(
  runbook: Runbook,
  alarmName: string,
  respond: LogsResponderFn,
  params: Readonly<Record<string, string>> = DEFAULT_WINDOW,
): Promise<RunbookLogsExecution> {
  return executeWithLogs(runbook, { alarmName, ...params }, respond);
}

/**
 * Responder of a standard INTEROP k8s pipeline: application errors of the
 * alarmed pod, CID tracker rows of another service and, for runbooks with a
 * pod context step, the full pod log. Each row carries the raw `log` and the
 * JSON envelope in `@message`, as the EKS collector writes them.
 *
 * @param scenario - Evidence to serve
 * @returns The responder
 *
 * @example
 * ```typescript
 * const respond = interopPodResponder({ podApp: alarm.podApp, messages: ['ERROR - boom'] });
 * ```
 */
export function interopPodResponder(scenario: InteropPodLogScenario): LogsResponderFn {
  const cidBlock = scenario.cid === undefined ? '' : `[CID=${scenario.cid}] `;
  return (query) => {
    if (isCidTrackerQuery(query)) {
      return cidTrackerRows(
        query,
        envelopeRows(scenario.trackerPodApp ?? 'interop-be-another-service', scenario.trackerMessages ?? [], ''),
      );
    }
    if (query.includes('/ERROR/')) return envelopeRows(scenario.podApp, scenario.messages ?? [], cidBlock);
    if (scenario.failContext === true) throw new Error('AccessDenied');
    return envelopeRows(scenario.podApp, scenario.contextMessages ?? ['INFO - Consumer subscribed'], '');
  };
}

function envelopeRows(podApp: string, messages: ReadonlyArray<string>, prefix: string): LogRows {
  return messages.map((message) => {
    const log = `${prefix}${message}`;
    return [
      { field: 'pod_app', value: podApp },
      { field: 'log', value: log },
      { field: '@message', value: JSON.stringify({ log, pod_app: podApp, stream: 'stderr' }) },
    ];
  });
}
