import { omitUndefined } from '@pagopa/go-common/utils';

import type { ErrorNodeSpec, EvidenceIdentifier, TreeEnumeratorFn } from '../../../../../engine/index.js';
import { safeCorrelationValue } from '../../../../../engine/internal.js';
import { readServiceLogRow } from '../../../../common/parsing/applicationLogs/readServiceLogRow.js';
import type { ServiceLogRow } from '../../../../common/parsing/applicationLogs/ServiceLogRow.js';
import { matchTraceIdCandidate } from '../../../../common/parsing/traceIds/matchTraceIdCandidate.js';
import { boundedText } from '../../../../common/parsing/correlation/boundedText.js';
import { errorNodeLabel } from '../../../../common/tree/errorNodeLabel.js';
import { occurredAtOf } from '../../../../common/parsing/correlation/occurredAtOf.js';
import { findKnownUrlCall } from '../correlation/scanServiceLogs.js';
import type { ServiceErrorLevelConfig } from './ServiceErrorLevelConfig.js';
import type { CloudWatchLogsRow } from '../../../../common/steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';

/** A row of the read with its fields, message and level read once. */
interface ReadRow {
  readonly raw: CloudWatchLogsRow;
  readonly row: ServiceLogRow;
}

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
    const errors: ReadRow[] = [];
    const others: ReadRow[] = [];
    for (const raw of rows) {
      if (!Array.isArray(raw)) continue;
      const row = readServiceLogRow(raw as CloudWatchLogsRow, config.schema);
      (row.isErrorLevel || (row.level === '' && row.hasErrorKeyword) ? errors : others).push({
        raw: raw as CloudWatchLogsRow,
        row,
      });
    }
    const errorRows = errors.map(({ raw }) => raw);
    const otherRows = others.map(({ raw }) => raw);

    const nodes = errors.map(({ raw, row }, index): ErrorNodeSpec => {
      const occurredAt = occurredAtOf([raw]);
      const traceId = matchTraceIdCandidate(row.fields, config.schema, 'field');
      const correlation = correlationOf(
        identifier,
        traceId?.canonical ?? (secondAttempt?.kind === 'traceId' ? secondAttempt.value : undefined),
      );
      return {
        key: `e${String(index + 1)}`,
        label: errorNodeLabel(row.message),
        ...(occurredAt !== undefined ? { occurredAt } : {}),
        correlation,
        vars: {
          ...nodeVars(config, [row], boundedText(row.message)),
          ...readTrace(config, [row], identifier, secondAttempt),
        },
        scopedOutputs: { [config.readStepId]: [raw] },
        contextOutputs: { [config.readStepId]: otherRows },
        siblingOutputs: { [config.readStepId]: errorRows },
      };
    });

    // The rows that are not errors may call known downstreams the error rows do not: a route each, never a node.
    // One pseudo-node per call: the target and the fallback UUID of the call, so two calls to the same service are
    // two routes.
    const byTarget = new Map<string, ReadRow[]>();
    for (const other of others) {
      const call = findKnownUrlCall([other.row], config.registry);
      const target = call.knownUrl?.known.target ?? '';
      if (target === '') continue;
      const key = `${target}|${call.fallbackUuid ?? ''}`;
      const group = byTarget.get(key) ?? [];
      group.push(other);
      byTarget.set(key, group);
    }
    return {
      nodes,
      routings: [...byTarget.entries()].map(([target, group]) => {
        const routeRows = group.map(({ row }) => row);
        return {
          key: `route:${target}`,
          label: 'righe di contesto',
          vars: { ...nodeVars(config, routeRows, ''), ...readTrace(config, routeRows, identifier, secondAttempt) },
          scopedOutputs: { [config.readStepId]: group.map(({ raw }) => raw) },
        };
      }),
    };
  };
}

/** The variables of a node, or of the routing pseudo-node, from its rows. */
function nodeVars(
  config: ServiceErrorLevelConfig,
  rows: ReadonlyArray<ServiceLogRow>,
  errorMessage: string,
): Readonly<Record<string, string>> {
  const { knownUrl, fallbackUuid } = findKnownUrlCall(rows, config.registry);
  return {
    [`${config.varPrefix}ErrorMsg`]: errorMessage,
    [`${config.varPrefix}NextUrl`]: knownUrl?.observedUrl ?? '',
    [`${config.varPrefix}NextUrlTarget`]: knownUrl?.known.target ?? '',
    // A known call follows its own fallback UUID, or the trace id when the call has none.
    ...(knownUrl !== undefined ? { fallbackUuid: fallbackUuid ?? '' } : {}),
  };
}

/** The correlation of a node: the trace id it was found by or carries, the fallback UUID it was found by. */
function correlationOf(
  identifier: EvidenceIdentifier | undefined,
  rowTraceId: string | undefined,
): Readonly<Record<string, string>> {
  const traceId = safeCorrelationValue(rowTraceId ?? (identifier?.kind === 'traceId' ? identifier.value : undefined));
  const fallbackUuid = identifier?.kind === 'fallbackUuid' ? safeCorrelationValue(identifier.value) : undefined;
  return {
    ...omitUndefined({ traceId, fallbackUuid }),
  };
}

/**
 * The trace id a read by fallback UUID revealed: the one of the rows, else the one the second attempt read by. The
 * calls found there follow it.
 */
function readTrace(
  config: ServiceErrorLevelConfig,
  rows: ReadonlyArray<ServiceLogRow>,
  identifier: EvidenceIdentifier | undefined,
  secondAttempt: EvidenceIdentifier | undefined,
): Readonly<Record<string, string>> {
  if (identifier?.kind !== 'fallbackUuid') return {};
  for (const row of rows) {
    const trace = matchTraceIdCandidate(row.fields, config.schema, 'field');
    if (trace !== undefined) return { [config.traceIdContextVar]: trace.canonical };
  }
  return secondAttempt?.kind === 'traceId' ? { [config.traceIdContextVar]: secondAttempt.value } : {};
}
