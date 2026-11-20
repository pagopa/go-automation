import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { ErrorNodeSpec } from '../../../../../engine/types/ErrorNodeSpec.js';
import type { TreeEnumeratorFn } from '../../../../../engine/types/TreeEnumeratorFn.js';
import { isStepEvidenceComplete } from '../../../../../engine/context/isStepEvidenceComplete.js';
import { readServiceLogRow } from '../../../parsing/applicationLogs/readServiceLogRow.js';
import { scanApplicationLogs } from '../../../parsing/applicationLogs/scanApplicationLogs.js';
import { boundedText } from '../../../parsing/correlation/boundedText.js';
import { occurredAtOf } from '../../../parsing/correlation/occurredAtOf.js';
import { safeCorrelationValue } from '../../../parsing/correlation/safeCorrelationValue.js';
import type { ServiceErrorRootConfig } from './ServiceErrorRootConfig.js';

type Row = ReadonlyArray<GOLogsInsightsResultField>;

const MAX_LABEL = 160;

/**
 * The root level of a service runbook: one node per error row of the application logs, with its message, trace id
 * and fallback UUID; every other row of the scan is a sibling.
 *
 * @param config - Error scan step, variable prefix and schema
 * @returns The enumerator
 */
export function enumerateServiceRootErrors(config: ServiceErrorRootConfig): TreeEnumeratorFn {
  return ({ context }) => {
    const output = context.stepResults.get(config.stepId);
    const rows: ReadonlyArray<Row> = Array.isArray(output) ? (output as ReadonlyArray<Row>) : [];
    const scans = rows.map((row) => scanApplicationLogs([row], config.schema, config.extractFallbackUuid));
    // The siblings of an error are the other errors of its trace; an error without trace has none.
    const byTrace = new Map<string, Row[]>();
    for (const [index, row] of rows.entries()) {
      const trace = scans[index]?.traceIdCandidate?.canonical;
      if (trace === undefined) continue;
      const group = byTrace.get(trace) ?? [];
      group.push(row);
      byTrace.set(trace, group);
    }
    const nodes = rows.map((row, index): ErrorNodeSpec => {
      const scan = scans[index] ?? scanApplicationLogs([row], config.schema, config.extractFallbackUuid);
      const message = scan.errorMessage !== '' ? scan.errorMessage : readServiceLogRow(row, config.schema).message;
      const traceId = scan.traceIdCandidate?.canonical;
      const occurredAt = occurredAtOf([row]);
      const correlationTrace = safeCorrelationValue(traceId);
      return {
        key: `e${String(index + 1)}`,
        label: boundedText(message.split('\n')[0] ?? '', MAX_LABEL) || 'errore senza messaggio',
        ...(occurredAt !== undefined ? { occurredAt } : {}),
        correlation: correlationTrace !== undefined ? { traceId: correlationTrace } : {},
        vars: {
          [`${config.varPrefix}ErrorMsg`]: boundedText(message),
          [`${config.varPrefix}LogCount`]: String(rows.length),
          [`${config.varPrefix}TraceId`]: traceId ?? '',
          [`${config.varPrefix}TraceIdRaw`]: scan.traceIdCandidate?.raw ?? '',
          [`${config.varPrefix}FallbackUuid`]: scan.fallbackUuid ?? '',
        },
        scopedOutputs: { [config.stepId]: [row] },
        siblingOutputs: { [config.stepId]: traceId === undefined ? [] : (byTrace.get(traceId) ?? []) },
      };
    });
    return {
      nodes,
      observedErrors: {
        unit: 'errorRow',
        observed: nodes.length,
        ...(isStepEvidenceComplete(context, config.stepId) ? {} : { lowerBound: true }),
      },
    };
  };
}
