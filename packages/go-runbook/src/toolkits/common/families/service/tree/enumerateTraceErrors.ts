import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { ErrorNodeSpec } from '../../../../../engine/types/ErrorNodeSpec.js';
import type { TreeEnumeratorFn } from '../../../../../engine/types/TreeEnumeratorFn.js';
import { readServiceLogRow } from '../../../parsing/applicationLogs/readServiceLogRow.js';
import type { ServiceLogSchema } from '../../../parsing/applicationLogs/ServiceLogSchema.js';
import { boundedText } from '../../../parsing/correlation/boundedText.js';
import { occurredAtOf } from '../../../parsing/correlation/occurredAtOf.js';

type Row = ReadonlyArray<GOLogsInsightsResultField>;

const MAX_LABEL = 160;

/**
 * The trace level of a service runbook: one node per error row of the trace (an ERROR or WARN level, or an error
 * keyword without level), the other rows its context.
 *
 * @param readStepId - The grouped read of the level
 * @param varPrefix - Prefix of the variables of the trace (`<service prefix>Trace`)
 * @param schema - Schema of the application logs
 * @returns The enumerator
 */
export function enumerateTraceErrors(
  readStepId: string,
  varPrefix: string,
  schema: ServiceLogSchema,
): TreeEnumeratorFn {
  return ({ rows }) => {
    const parsed = rows.flatMap((raw) => {
      if (!Array.isArray(raw)) return [];
      const row = readServiceLogRow(raw as Row, schema);
      return [
        { raw: raw as Row, message: row.message, error: row.isErrorLevel || (row.level === '' && row.hasErrorKeyword) },
      ];
    });
    const errors = parsed.filter((entry) => entry.error);
    const others = parsed.filter((entry) => !entry.error).map((entry) => entry.raw);
    const errorRows = errors.map((entry) => entry.raw);
    return {
      nodes: errors.map(({ raw, message }, index): ErrorNodeSpec => {
        const occurredAt = occurredAtOf([raw]);
        return {
          key: `t${String(index + 1)}`,
          label: boundedText(message.split('\n')[0] ?? '', MAX_LABEL) || 'errore senza messaggio',
          ...(occurredAt !== undefined ? { occurredAt } : {}),
          vars: { [`${varPrefix}ErrorMsg`]: boundedText(message), lastErrorMsg: boundedText(message) },
          scopedOutputs: { [readStepId]: [raw] },
          contextOutputs: { [readStepId]: others },
          siblingOutputs: { [readStepId]: errorRows },
        };
      }),
    };
  };
}
