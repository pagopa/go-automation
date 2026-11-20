import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { ErrorNodeSpec } from '../../../../../engine/types/ErrorNodeSpec.js';
import type { TreeEnumeratorFn } from '../../../../../engine/types/TreeEnumeratorFn.js';
import type { TreeReadIdentifier } from '../../../../../engine/types/TreeReadIdentifier.js';
import { readServiceLogRow } from '../../../../common/parsing/applicationLogs/readServiceLogRow.js';
import { matchTraceIdCandidate } from '../../../../common/parsing/applicationLogs/matchTraceIdCandidate.js';
import { boundedText } from '../../../../common/parsing/correlation/boundedText.js';
import { occurredAtOf } from '../../../../common/parsing/correlation/occurredAtOf.js';
import { safeCorrelationValue } from '../../../../common/parsing/correlation/safeCorrelationValue.js';
import { scanServiceLogs } from '../correlation/scanServiceLogs.js';
import type { ServiceErrorLevelConfig } from './ServiceErrorLevelConfig.js';

type Row = ReadonlyArray<GOLogsInsightsResultField>;

/** Longest label of a service error node. */
const MAX_LABEL = 160;

/**
 * The enumerator of a service level of a SEND API Gateway runbook: one node per error row (an ERROR or WARN level,
 * or an error keyword in a row without level), with its message.
 *
 * Each node scopes its row; the other error rows of the same identifier are its siblings, the rows that are not
 * errors its context. A node publishes `<prefix>ErrorMsg`, the known URL its row calls (`<prefix>NextUrl`,
 * `<prefix>NextUrlTarget`) with the fallback UUID of that call, and, when the read was by fallback UUID, the trace
 * id of its row. The rows that are not errors become the routing pseudo-node, when they call a known URL.
 *
 * Complexity: O(R · F) over the rows and their fields.
 *
 * @param config - Read step, variable prefix, schema and known URLs of the service
 * @returns The enumerator
 */
export function enumerateServiceErrors(config: ServiceErrorLevelConfig): TreeEnumeratorFn {
  return ({ rows, identifier, secondAttempt }) => {
    const parsed = rows.flatMap((raw) => {
      if (!Array.isArray(raw)) return [];
      const row = readServiceLogRow(raw as Row, config.schema);
      return [{ raw: raw as Row, row, error: row.isErrorLevel || (row.level === '' && row.hasErrorKeyword) }];
    });
    const errors = parsed.filter((entry) => entry.error).map((entry) => entry.raw);
    const others = parsed.filter((entry) => !entry.error).map((entry) => entry.raw);

    const nodes = errors.map((raw, index): ErrorNodeSpec => {
      const message = readServiceLogRow(raw, config.schema).message;
      const occurredAt = occurredAtOf([raw]);
      const traceId = matchTraceIdCandidate(readServiceLogRow(raw, config.schema).fields, config.schema, 'field');
      const correlation = correlationOf(
        identifier,
        traceId?.canonical ?? (secondAttempt?.kind === 'traceId' ? secondAttempt.value : undefined),
      );
      return {
        key: `e${String(index + 1)}`,
        label: boundedText(message.split('\n')[0] ?? '', MAX_LABEL) || 'errore senza messaggio',
        ...(occurredAt !== undefined ? { occurredAt } : {}),
        correlation,
        vars: {
          ...nodeVars(config, [raw], boundedText(message)),
          ...readTrace(config, [raw], identifier, secondAttempt),
        },
        scopedOutputs: { [config.readStepId]: [raw] },
        contextOutputs: { [config.readStepId]: others },
        siblingOutputs: { [config.readStepId]: errors },
      };
    });

    // The rows that are not errors may call known downstreams the error rows do not: a route each, never a node.
    // One pseudo-node per call: the target and the fallback UUID of the call, so two calls to the same service are
    // two routes.
    const byTarget = new Map<string, Row[]>();
    for (const raw of others) {
      const vars = nodeVars(config, [raw], '');
      const target = vars[`${config.varPrefix}NextUrlTarget`] ?? '';
      if (target === '') continue;
      const key = `${target}|${vars['fallbackUuid'] ?? ''}`;
      const group = byTarget.get(key) ?? [];
      group.push(raw);
      byTarget.set(key, group);
    }
    return {
      nodes,
      routings: [...byTarget.entries()].map(([target, routeRows]) => ({
        key: `route:${target}`,
        label: 'righe di contesto',
        vars: { ...nodeVars(config, routeRows, ''), ...readTrace(config, routeRows, identifier, secondAttempt) },
        scopedOutputs: { [config.readStepId]: routeRows },
      })),
    };
  };
}

/** The variables of a node, or of the routing pseudo-node, from its rows. */
function nodeVars(
  config: ServiceErrorLevelConfig,
  rows: ReadonlyArray<Row>,
  errorMessage: string,
): Readonly<Record<string, string>> {
  const scan = scanServiceLogs(rows, config.schema, config.registry);
  const knownUrl = scan.knownUrl;
  return {
    [`${config.varPrefix}ErrorMsg`]: errorMessage,
    [`${config.varPrefix}NextUrl`]: knownUrl?.observedUrl ?? '',
    [`${config.varPrefix}NextUrlTarget`]: knownUrl?.known.target ?? '',
    // A known call follows its own fallback UUID, or the trace id when the call has none.
    ...(knownUrl !== undefined ? { fallbackUuid: scan.fallbackUuid ?? '' } : {}),
  };
}

/** The correlation of a node: the trace id it was found by or carries, the fallback UUID it was found by. */
function correlationOf(
  identifier: TreeReadIdentifier | undefined,
  rowTraceId: string | undefined,
): Readonly<Record<string, string>> {
  const traceId = safeCorrelationValue(rowTraceId ?? (identifier?.kind === 'traceId' ? identifier.value : undefined));
  const fallbackUuid = identifier?.kind === 'fallbackUuid' ? safeCorrelationValue(identifier.value) : undefined;
  return {
    ...(traceId !== undefined ? { traceId } : {}),
    ...(fallbackUuid !== undefined ? { fallbackUuid } : {}),
  };
}

/**
 * The trace id a read by fallback UUID revealed: the one of the rows, else the one the second attempt read by. The
 * calls found there follow it.
 */
function readTrace(
  config: ServiceErrorLevelConfig,
  rows: ReadonlyArray<Row>,
  identifier: TreeReadIdentifier | undefined,
  secondAttempt: TreeReadIdentifier | undefined,
): Readonly<Record<string, string>> {
  if (identifier?.kind !== 'fallbackUuid') return {};
  for (const row of rows) {
    const trace = matchTraceIdCandidate(readServiceLogRow(row, config.schema).fields, config.schema, 'field');
    if (trace !== undefined) return { [config.traceIdContextVar]: trace.canonical };
  }
  return secondAttempt?.kind === 'traceId' ? { [config.traceIdContextVar]: secondAttempt.value } : {};
}
