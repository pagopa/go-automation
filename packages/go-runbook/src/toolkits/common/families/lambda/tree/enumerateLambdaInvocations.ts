import { omitUndefined } from '@pagopa/go-common/utils';
import { readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { ErrorNodeSpec, TreeEnumeratorFn } from '../../../../../engine/index.js';
import { safeCorrelationValue } from '../../../../../engine/internal.js';
import { errorNodeLabel } from '../../../tree/errorNodeLabel.js';
import { occurredAtOf } from '../../../parsing/correlation/occurredAtOf.js';
import { LAMBDA_REQUEST_ID } from '../helpers/lambdaRequestIdFilter.js';
import { lambdaRowRequestId } from '../helpers/lambdaRowRequestId.js';
import { scanLambdaLogs } from '../helpers/scanLambdaLogs.js';
import type { LambdaInvocationLevelConfig } from './LambdaInvocationLevelConfig.js';
import type { CloudWatchLogsRow } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';

/** Fields with the source a multi-account read tags its rows with. */
const SOURCE_FIELDS: ReadonlyArray<string> = ['sourceAccount', 'sourceKey'];

/**
 * The enumerator of the root level of a Lambda runbook: one node per invocation in error.
 *
 * An invocation is its source (for a multi-account read) and its request id, structured or named by the message; a
 * row without a usable request id is an invocation of its own, with a synthetic key. Each node scopes its error rows
 * and the rows of the reconstruction of the same source and request id, the structured `@requestId` deciding over
 * the message.
 *
 * Complexity: O(R + I) over the rows of the error scan and of the reconstruction.
 *
 * @param config - Steps of the error scan and of the reconstruction
 * @returns The enumerator
 */
export function enumerateLambdaInvocations(config: LambdaInvocationLevelConfig): TreeEnumeratorFn {
  return ({ context }) => {
    const errors = asRows(context.stepResults.get(config.errorsStepId));
    const invocations = new Map<string, CloudWatchLogsRow[]>();
    for (const [index, row] of errors.entries()) {
      const key = invocationKey(row) ?? `row:${String(index)}`;
      const group = invocations.get(key) ?? [];
      group.push(row);
      invocations.set(key, group);
    }

    const flows = new Map<string, CloudWatchLogsRow[]>();
    for (const row of asRows(context.stepResults.get(config.invocationStepId))) {
      const key = invocationKey(row);
      if (key === undefined || !invocations.has(key)) continue;
      const group = flows.get(key) ?? [];
      group.push(row);
      flows.set(key, group);
    }

    const nodes = [...invocations.entries()].map(([key, rows]): ErrorNodeSpec => {
      const first = rows[0] ?? [];
      const requestId = key.startsWith('row:') ? undefined : safeCorrelationValue(lambdaRowRequestId(first));
      const source = safeCorrelationValue(sourceOf(first));
      const message = scanLambdaLogs(rows, [])?.message ?? '';
      const occurredAt = occurredAtOf(rows);
      return {
        key,
        label: errorNodeLabel(message, 'invocazione in errore'),
        ...(occurredAt !== undefined ? { occurredAt } : {}),
        correlation: {
          ...omitUndefined({ requestId, source }),
        },
        scopedOutputs: { [config.errorsStepId]: rows, [config.invocationStepId]: flows.get(key) ?? [] },
      };
    });

    return {
      nodes,
      observedErrors: {
        unit: 'invocation',
        observed: nodes.length,
        ...(context.reads.isComplete(config.errorsStepId) ? {} : { lowerBound: true }),
      },
    };
  };
}

/** Source and request id of a row; nothing when the row has no usable request id. */
function invocationKey(row: CloudWatchLogsRow): string | undefined {
  const requestId = lambdaRowRequestId(row);
  if (requestId === undefined || !LAMBDA_REQUEST_ID.test(requestId)) return undefined;
  const source = sourceOf(row);
  return source === undefined ? requestId : `${source}|${requestId}`;
}

/** The source tag of a row of a multi-account read. */
function sourceOf(row: CloudWatchLogsRow): string | undefined {
  for (const field of SOURCE_FIELDS) {
    const value = readRowField(row, field);
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

/** The rows of a step output, or none. */
function asRows(output: unknown): ReadonlyArray<CloudWatchLogsRow> {
  return Array.isArray(output) ? (output as ReadonlyArray<CloudWatchLogsRow>) : [];
}
