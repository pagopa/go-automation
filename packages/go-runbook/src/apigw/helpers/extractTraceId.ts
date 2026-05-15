import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';
import type { AccessLogSchema } from '../profiles/schemas/AccessLogSchema.js';
import { extractCwField } from './extractCwField.js';

/**
 * Estrae il trace id da una riga di AccessLog, generico per prodotto.
 *
 * Il nome del campo CloudWatch da cui leggere e il pattern opzionale per
 * estrarre il valore "puro" sono entrambi specificati nel
 * {@link AccessLogSchema}:
 *
 * - SEND: campo `xrayTraceId` con forma `Root=<value>`, pattern
 *   `'Root=([^\\s]+)'` → estrae `1-abc-def` da `Root=1-abc-def`.
 * - INTEROP: campo `cid` con valore già "raw", pattern `undefined` →
 *   restituisce il valore as-is.
 *
 * Se il pattern non è fornito o non matcha, viene restituito il valore
 * raw del campo.
 *
 * @param row - riga del CloudWatch Logs Insights result
 * @param schema - schema dei campi AccessLog (per `traceIdField` e
 *                 `traceIdExtractPattern`)
 * @returns il trace id estratto, oppure `undefined` se il campo è assente
 */
export function extractTraceId(row: ReadonlyArray<ResultField>, schema: AccessLogSchema): string | undefined {
  const raw = extractCwField(row, schema.traceIdField);
  if (raw === undefined) return undefined;

  if (schema.traceIdExtractPattern === undefined) {
    return raw;
  }

  // Compilazione on-demand. L'estrazione avviene una sola volta per riga
  // d'errore (poche unità) per esecuzione del runbook, quindi non vale la
  // pena cachare il RegExp compilato per schema.
  const pattern = new RegExp(schema.traceIdExtractPattern);
  const match = pattern.exec(raw);
  return match?.[1] ?? raw;
}

/**
 * @deprecated Usare {@link extractTraceId}. Rimosso in v2.0.
 *
 * Alias di back-compat che richiede comunque uno {@link AccessLogSchema}
 * per restare uniforme con il nuovo contratto. Le call site che usavano
 * la vecchia firma (`(row) => string | undefined`) devono migrare passando
 * `SEND_API_GW_PROFILE.accessLog.schema` (o lo schema del profilo in uso).
 */
export function extractXRayTraceId(row: ReadonlyArray<ResultField>, schema: AccessLogSchema): string | undefined {
  return extractTraceId(row, schema);
}
