import type { ErrorNodeSpec, TreeEnumeratorFn } from '../../../engine/index.js';
import { readServiceLogRow } from '../parsing/applicationLogs/readServiceLogRow.js';
import type { ServiceLogSchema } from '../parsing/applicationLogs/ServiceLogSchema.js';
import { boundedText } from '../parsing/correlation/boundedText.js';
import { occurredAtOf } from '../parsing/correlation/occurredAtOf.js';
import { errorNodeLabel } from './errorNodeLabel.js';
import type { CloudWatchLogsRow } from '../steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';

/**
 * The enumerator of a level read as application logs: one node per error row, with its message as
 * `<prefix>ErrorMsg` and `lastErrorMsg`; the other rows are the context of every node, the error rows its siblings.
 *
 * A row is an error when its level says error or warning, or, in a row without level, when its message contains an
 * error keyword: a row with any other level is never an error because of its words.
 *
 * Complexity: O(N) over the rows of the level.
 *
 * @param readStepId - The grouped read of the level
 * @param varPrefix - Prefix of the variables of the level
 * @param schema - Schema of the application logs
 * @param keyPrefix - Prefix of the node keys (`<prefix>1`, `<prefix>2`, …)
 * @returns The enumerator
 *
 * @example
 * ```typescript
 * enumerateErrorRows('read-trace', 'deliveryTrace', schema, 't');
 * ```
 */
export function enumerateErrorRows(
  readStepId: string,
  varPrefix: string,
  schema: ServiceLogSchema,
  keyPrefix: string,
): TreeEnumeratorFn {
  return ({ rows }) => {
    const errors: { readonly row: CloudWatchLogsRow; readonly message: string }[] = [];
    const others: CloudWatchLogsRow[] = [];
    for (const raw of rows) {
      if (!Array.isArray(raw)) continue;
      const row = raw as CloudWatchLogsRow;
      const parsed = readServiceLogRow(row, schema);
      if (parsed.isErrorLevel || (parsed.level === '' && parsed.hasErrorKeyword)) {
        errors.push({ row, message: parsed.message });
      } else {
        others.push(row);
      }
    }
    const errorRows = errors.map(({ row }) => row);
    return {
      nodes: errors.map(({ row, message }, index): ErrorNodeSpec => {
        const occurredAt = occurredAtOf([row]);
        const bounded = boundedText(message);
        return {
          key: `${keyPrefix}${String(index + 1)}`,
          label: errorNodeLabel(message),
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
