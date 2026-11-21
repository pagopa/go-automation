import { type GOLogsInsightsResultField, readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { ErrorNodeSpec } from '../../../../../engine/types/ErrorNodeSpec.js';
import type { TreeEnumeratorFn } from '../../../../../engine/types/TreeEnumeratorFn.js';
import { isRequestId } from '../../../../../engine/reads/isRequestId.js';
import { extractTraceId } from '../../../../common/families/apigw/accessLog/extractTraceId.js';
import {
  pickPrimaryStatusCode,
  rowMeetsThreshold,
  sanitizeApiGwField,
} from '../../../../common/families/apigw/accessLog/accessLogRow.js';
import { occurredAtOf } from '../../../../common/parsing/correlation/occurredAtOf.js';
import { safeCorrelationValue } from '../../../../../engine/reads/safeCorrelationValue.js';
import { canonicalTraceId } from '../../../../common/parsing/traceIds/canonicalTraceId.js';
import type { ApiGwRequestLevelConfig } from './ApiGwRequestLevelConfig.js';

type Row = ReadonlyArray<GOLogsInsightsResultField>;

/**
 * The enumerator of the root level of a SEND API Gateway runbook: one node per request in error of the access log.
 *
 * A request is identified by its request id; a row without a usable one is a request of its own, with a synthetic
 * key. Each node scopes its access-log rows and the execution-log rows of its request id, and is labelled with
 * status, method and path. The nodes keep the order of the access log, which is the time order.
 *
 * Complexity: O(R + E) over the access-log and execution-log rows.
 *
 * @param config - Steps and schema of the access log
 * @returns The enumerator
 *
 * @example
 * ```typescript
 * const root = { target: 'api-gateway', scopedSteps: ['query-api-gw-logs'], enumerate: enumerateApiGwRequests(config) };
 * ```
 */
export function enumerateApiGwRequests(config: ApiGwRequestLevelConfig): TreeEnumeratorFn {
  const { schema } = config;
  return ({ context }) => {
    const rows = asRows(context.stepResults.get(config.accessLogStepId));
    const requests = new Map<string, Row[]>();
    for (const [index, row] of rows.entries()) {
      if (!rowMeetsThreshold(row, config.minStatusCode, schema)) continue;
      const requestId = sanitizeApiGwField(readRowField(row, schema.requestIdField), schema);
      // A row without a usable request id is a request of its own.
      const key = isRequestId(requestId) ? requestId : `row:${String(index)}`;
      const group = requests.get(key) ?? [];
      group.push(row);
      requests.set(key, group);
    }

    const executionRows = new Map<string, Row[]>();
    if (config.executionLogStepId !== undefined) {
      for (const row of asRows(context.stepResults.get(config.executionLogStepId))) {
        const requestId = readRowField(row, 'requestId') ?? '';
        if (requestId === '') continue;
        const group = executionRows.get(requestId) ?? [];
        group.push(row);
        executionRows.set(requestId, group);
      }
    }

    const nodes = [...requests.entries()].map(([key, requestRows]): ErrorNodeSpec => {
      const first = requestRows[0] ?? [];
      const requestId = key.startsWith('row:') ? undefined : safeCorrelationValue(key);
      const rawTrace = extractTraceId(first, schema) ?? '';
      const traceId = safeCorrelationValue(canonicalTraceId(rawTrace.split(';')[0] ?? '') ?? rawTrace);
      const label = [
        pickPrimaryStatusCode(first, schema),
        sanitizeApiGwField(readRowField(first, schema.httpMethodField), schema),
        sanitizeApiGwField(readRowField(first, schema.pathField), schema),
      ]
        .filter((part) => part !== '')
        .join(' ');
      const occurredAt = occurredAtOf(requestRows);
      // A gap of the execution-log read that names the request leaves it incomplete; the ledger knows its node is.
      const incomplete =
        requestId !== undefined &&
        config.executionLogStepId !== undefined &&
        context.reads.hasGapFor(config.executionLogStepId, { kind: 'requestId', value: requestId });
      return {
        key,
        label: label !== '' ? label : 'richiesta in errore',
        ...(occurredAt !== undefined ? { occurredAt } : {}),
        correlation: {
          ...(requestId !== undefined ? { requestId } : {}),
          ...(traceId !== undefined ? { traceId } : {}),
        },
        // A request without request id was never read in the execution logs, whatever the window did.
        ...(config.executionLogStepId !== undefined && (requestId === undefined || incomplete)
          ? { vars: { apiGwExecutionLogMode: requestId === undefined ? 'no-request-id' : 'incomplete' } }
          : {}),
        scopedOutputs: {
          [config.accessLogStepId]: requestRows,
          ...(config.executionLogStepId !== undefined
            ? { [config.executionLogStepId]: executionRows.get(key) ?? [] }
            : {}),
        },
      };
    });

    return {
      nodes,
      observedErrors: {
        unit: 'request',
        observed: nodes.length,
        ...(context.reads.isComplete(config.accessLogStepId) ? {} : { lowerBound: true }),
      },
    };
  };
}

/** The rows of a step output, or none. */
function asRows(output: unknown): ReadonlyArray<Row> {
  return Array.isArray(output) ? (output as ReadonlyArray<Row>) : [];
}
