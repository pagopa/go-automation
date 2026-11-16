import { readXrayHeaderRoot } from '../traceIds/readXrayHeaderRoot.js';
import { transformRawTraceId } from '../traceIds/transformRawTraceId.js';
import type { ServiceLogSchema } from './ServiceLogSchema.js';
import type { TraceIdCandidateMatch } from './TraceIdCandidateMatch.js';
import type { TraceIdSearchPolicy } from './TraceIdSearchPolicy.js';

/** A canonical X-Ray trace id anywhere in a message. */
const XRAY_TRACE_ID_PATTERN = /\b1-[0-9a-fA-F]{8}-[0-9a-fA-F]{24}\b/;

/**
 * A 32-hex trace id embedded in the message text, **only when explicitly
 * labeled** (e.g. `"trace_id":"<hex>"`, `traceId=<hex>`, `trace-id: <hex>`).
 * Requiring the label avoids treating any bare 32-hex token (MD5, dash-less
 * UUID, request hash) as a trace id.
 */
const LABELED_TRACE_ID_PATTERN = /trace[_-]?id["'\s:=]+([0-9a-f]{32})(?![0-9a-f])/i;

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
  const fromField = policy === 'field' ? transformRawTraceId(raw) : canonicalTraceId(raw);
  if (fromField !== undefined) return { raw, canonical: fromField };
  if (policy === 'field') return undefined;

  // A structured message can omit identifiers carried by the full @message.
  for (const candidate of schema.messageFieldCandidates) {
    const message = fields.get(candidate) ?? '';
    const xray = XRAY_TRACE_ID_PATTERN.exec(message)?.[0];
    if (xray !== undefined) return { raw: xray, canonical: xray };

    const labeled = LABELED_TRACE_ID_PATTERN.exec(message)?.[1];
    const fromMessage = labeled === undefined ? undefined : canonicalTraceId(labeled);
    if (labeled !== undefined && fromMessage !== undefined) return { raw: labeled, canonical: fromMessage };
  }
  return undefined;
}

function canonicalTraceId(raw: string): string | undefined {
  return transformRawTraceId(raw) ?? readXrayHeaderRoot(raw);
}
