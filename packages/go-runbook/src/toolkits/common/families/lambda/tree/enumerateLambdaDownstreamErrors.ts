import type { TreeEnumeratorFn } from '../../../../../engine/index.js';
import type { ServiceLogSchema } from '../../../parsing/applicationLogs/ServiceLogSchema.js';
import { enumerateErrorRows } from '../../../tree/enumerateErrorRows.js';

const DOWNSTREAM_LOG_SCHEMA: ServiceLogSchema = {
  messageFieldCandidates: ['@message', 'message'],
  levelField: 'level',
  traceIdField: 'trace_id',
};

/**
 * The enumerator of a downstream level of a Lambda runbook: one node per error row of the downstream logs of the
 * invocation (see `enumerateErrorRows`), with its message as `<prefix>ErrorMsg` and `lastErrorMsg`. The other rows
 * are context.
 *
 * @param readStepId - The grouped read of the level
 * @param varPrefix - Prefix of the variables of the downstream
 * @returns The enumerator
 */
export function enumerateLambdaDownstreamErrors(readStepId: string, varPrefix: string): TreeEnumeratorFn {
  return enumerateErrorRows(readStepId, varPrefix, DOWNSTREAM_LOG_SCHEMA, 'e');
}
