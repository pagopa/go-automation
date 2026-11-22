import type { TreeEnumeratorFn } from '../../../../../engine/index.js';
import type { ServiceLogSchema } from '../../../parsing/applicationLogs/ServiceLogSchema.js';
import { enumerateErrorRows } from '../../../tree/enumerateErrorRows.js';

/**
 * The trace level of a service runbook: one node per error row of the trace (see `enumerateErrorRows`), the other
 * rows its context.
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
  return enumerateErrorRows(readStepId, varPrefix, schema, 't');
}
