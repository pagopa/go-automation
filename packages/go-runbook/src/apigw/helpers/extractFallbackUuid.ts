import type { ResultField } from '@go-automation/go-common/aws';
import type { ServiceLogSchema } from '../profiles/schemas/ServiceLogSchema.js';
import { readMessageField } from './readMessageField.js';

/**
 * Compiled pattern that matches the `FALLBACK-UUID:<uuid>` token emitted
 * by the `pn-*` microservices in the `traceId` field of their error
 * response bodies (and propagated through downstream service responses).
 *
 * The captured UUID follows the canonical 8-4-4-4-12 hex layout. The
 * pattern is anchored on `FALLBACK-UUID:` exactly to avoid catching the
 * literal `X-Ray` trace id, which has a different format (`1-XXXX-YYYY`).
 */
const FALLBACK_UUID_PATTERN =
  /FALLBACK-UUID:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

/**
 * Extracts the fallback UUID from a CloudWatch Logs Insights result set
 * (first match wins).
 *
 * Microservices embed the fallback UUID inside the JSON body of their
 * error responses, typically as `"traceId":"FALLBACK-UUID:<uuid>"`. The
 * helper scans the message field (per `schema.messageFieldCandidates`) of
 * each row and returns the first UUID that matches the canonical pattern.
 *
 * Callers decide whether the fallback is meaningful in their own
 * context. API Gateway service analysis, for example, only promotes it
 * when the same result set also contains a known downstream URL.
 *
 * Complessità: O(N) sul numero di righe; il regex è pre-compilato.
 *
 * @param results - CloudWatch Logs Insights result rows
 * @param schema - schema dei log applicativi (per il campo message)
 * @returns Il primo fallback UUID trovato, oppure `undefined`
 */
export function extractFallbackUuid(
  results: ReadonlyArray<ResultField[]>,
  schema: ServiceLogSchema,
): string | undefined {
  for (const row of results) {
    const message = readMessageField(row, schema);
    if (message === '') continue;
    const match = FALLBACK_UUID_PATTERN.exec(message);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }
  return undefined;
}
