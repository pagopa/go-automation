import type { ResultField } from '@go-automation/go-common/aws';
import type { ServiceLogSchema } from '../profiles/schemas/ServiceLogSchema.js';
import { scanServiceLogs } from './scanServiceLogs.js';

/**
 * Extracts the fallback UUID from a CloudWatch Logs Insights result set
 * (first match wins).
 *
 * Microservices embed the fallback UUID inside the JSON body of their
 * error responses, typically as `"traceId":"FALLBACK-UUID:<uuid>"`. The
 * helper scans the message field (per `schema.messageFieldCandidates`) of
 * each row and returns the first UUID matching the canonical pattern.
 *
 * @param results - CloudWatch Logs Insights result rows
 * @param schema - schema dei log applicativi (per il campo message)
 * @returns Il primo fallback UUID trovato, oppure `undefined`
 */
export function extractFallbackUuid(
  results: ReadonlyArray<ResultField[]>,
  schema: ServiceLogSchema,
): string | undefined {
  return scanServiceLogs(results, schema).fallbackUuid;
}
