import type { ErrorNodeSpec, TreeEnumeratorFn } from '../../../../../engine/index.js';
import { safeCorrelationValue } from '../../../../../engine/internal.js';
import { readServiceLogRow } from '../../../parsing/applicationLogs/readServiceLogRow.js';
import { scanApplicationLogs } from '../../../parsing/applicationLogs/scanApplicationLogs.js';
import { boundedText } from '../../../parsing/correlation/boundedText.js';
import { errorNodeLabel } from '../../../tree/errorNodeLabel.js';
import { occurredAtOf } from '../../../parsing/correlation/occurredAtOf.js';
import type { ServiceErrorRootConfig } from './ServiceErrorRootConfig.js';
import type { CloudWatchLogsRow } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';

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
    const rows: ReadonlyArray<CloudWatchLogsRow> = Array.isArray(output)
      ? (output as ReadonlyArray<CloudWatchLogsRow>)
      : [];
    const scanned = rows.map((row) => ({
      row,
      scan: scanApplicationLogs([row], config.schema, config.extractFallbackUuid),
    }));
    // The siblings of an error are the other errors of its trace; an error without trace has none.
    const byTrace = new Map<string, CloudWatchLogsRow[]>();
    for (const { row, scan } of scanned) {
      const trace = scan.traceIdCandidate?.canonical;
      if (trace === undefined) continue;
      const group = byTrace.get(trace) ?? [];
      group.push(row);
      byTrace.set(trace, group);
    }
    const nodes = scanned.map(({ row, scan }, index): ErrorNodeSpec => {
      const message = scan.errorMessage !== '' ? scan.errorMessage : readServiceLogRow(row, config.schema).message;
      const traceId = scan.traceIdCandidate?.canonical;
      const occurredAt = occurredAtOf([row]);
      const correlationTrace = safeCorrelationValue(traceId);
      return {
        key: `e${String(index + 1)}`,
        label: errorNodeLabel(message),
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
        ...(context.reads.isComplete(config.stepId) ? {} : { lowerBound: true }),
      },
    };
  };
}
