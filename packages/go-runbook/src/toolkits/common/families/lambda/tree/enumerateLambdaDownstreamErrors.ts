import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { ErrorNodeSpec } from '../../../../../engine/types/ErrorNodeSpec.js';
import type { TreeEnumeratorFn } from '../../../../../engine/types/TreeEnumeratorFn.js';
import { boundedText } from '../../../parsing/correlation/boundedText.js';
import { occurredAtOf } from '../../../parsing/correlation/occurredAtOf.js';
import { readServiceLogRow } from '../../../parsing/applicationLogs/readServiceLogRow.js';
import type { ServiceLogSchema } from '../../../parsing/applicationLogs/ServiceLogSchema.js';

type Row = ReadonlyArray<GOLogsInsightsResultField>;

/** Longest label of a downstream error node. */
const MAX_LABEL = 160;

const DOWNSTREAM_LOG_SCHEMA: ServiceLogSchema = {
  messageFieldCandidates: ['@message', 'message'],
  levelField: 'level',
  traceIdField: 'trace_id',
};

/**
 * The enumerator of a downstream level of a Lambda runbook: one node per error row of the downstream logs of the
 * invocation, with its message as `<prefix>ErrorMsg` and `lastErrorMsg`. The other rows are context.
 *
 * @param readStepId - The grouped read of the level
 * @param varPrefix - Prefix of the variables of the downstream
 * @returns The enumerator
 */
export function enumerateLambdaDownstreamErrors(readStepId: string, varPrefix: string): TreeEnumeratorFn {
  return ({ rows }) => {
    const all = rows.filter((row): row is Row => Array.isArray(row));
    const errors = all.flatMap((row) => {
      const parsed = readServiceLogRow(row, DOWNSTREAM_LOG_SCHEMA);
      return parsed.isErrorLevel || parsed.hasErrorKeyword ? [{ row, message: parsed.message }] : [];
    });
    const errorRows = errors.map(({ row }) => row);
    const others = all.filter((row) => !errors.some((error) => error.row === row));
    return {
      nodes: errors.map(({ row, message }, index): ErrorNodeSpec => {
        const occurredAt = occurredAtOf([row]);
        const bounded = boundedText(message);
        return {
          key: `e${String(index + 1)}`,
          label: boundedText(message.split('\n')[0] ?? '', MAX_LABEL) || 'errore senza messaggio',
          ...(occurredAt !== undefined ? { occurredAt } : {}),
          vars: { [`${varPrefix}ErrorMsg`]: bounded, lastErrorMsg: bounded },
          scopedOutputs: { [readStepId]: [row] },
          contextOutputs: { [readStepId]: others },
          siblingOutputs: { [readStepId]: errorRows },
        };
      }),
    };
  };
}
