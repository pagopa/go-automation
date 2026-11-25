import type { ServiceLogSchema } from '../applicationLogs/ServiceLogSchema.js';
import { traceIdFormatOf } from './traceIdFormats.js';
import { canonicalTraceId } from './traceIdentity.js';
import type { TraceIdCandidateMatch } from './TraceIdCandidateMatch.js';
import type { TraceIdSearchPolicy } from './TraceIdSearchPolicy.js';
import { TRACE_ID_FORMATS } from './traceIdFormats.js';

/**
 * Trace id candidate of a row under a declared search policy.
 *
 * @param fields - Fields of the row
 * @param schema - Schema of the application logs
 * @param policy - Where to look
 * @returns The candidate, or `undefined`
 */
export function matchTraceIdCandidate(
  fields: ReadonlyMap<string, string>,
  schema: ServiceLogSchema,
  policy: TraceIdSearchPolicy,
): TraceIdCandidateMatch | undefined {
  const raw = (fields.get(schema.traceIdField) ?? fields.get(`@${schema.traceIdField}`) ?? '').trim();
  const fromField = policy === 'field' ? traceIdFormatOf(raw)?.canonical : canonicalTraceId(raw);
  if (fromField !== undefined) return { raw, canonical: fromField };
  if (policy === 'field') return undefined;

  // A structured message can omit identifiers carried by the full @message.
  for (const candidate of schema.messageFieldCandidates) {
    const message = fields.get(candidate) ?? '';
    for (const format of TRACE_ID_FORMATS) {
      const found = format.findInMessage(message);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}
