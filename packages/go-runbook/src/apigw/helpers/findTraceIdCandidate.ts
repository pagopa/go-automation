import type { ResultField } from '@go-automation/go-common/aws';
import type { ServiceLogSchema } from '../profiles/schemas/ServiceLogSchema.js';
import { scanServiceLogs } from './scanServiceLogs.js';

export { transformRawTraceId } from './transformRawTraceId.js';

/**
 * Outcome of {@link findTraceIdCandidate} when the scan yields a candidate.
 */
export interface TraceIdCandidateMatch {
  /** Raw token as it appeared in the log row (32 hex chars or canonical). */
  readonly raw: string;
  /** Canonical X-Ray form (`1-XXXXXXXX-…`). */
  readonly canonical: string;
}

/**
 * Scans CloudWatch Logs result rows for the first valid trace id field.
 *
 * Usato da `analyzeServiceLogs` per rilevare quando i log applicativi
 * portano un trace id dopo una query filtrata per `FALLBACK-UUID`. Il
 * valore è restituito anche quando coincide con il trace id corrente:
 * la prevenzione del loop è gestita dal passo `decide-*` successivo.
 *
 * @param results - CloudWatch Logs Insights result rows
 * @param schema - schema dei log applicativi (per il campo trace id)
 * @returns `{ raw, canonical }` del primo trace id valido, oppure `undefined`
 */
export function findTraceIdCandidate(
  results: ReadonlyArray<ResultField[]>,
  schema: ServiceLogSchema,
): TraceIdCandidateMatch | undefined {
  return scanServiceLogs(results, schema).traceIdCandidate;
}
