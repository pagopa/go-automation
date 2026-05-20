import type { ResultField } from '@go-automation/go-common/aws';
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

  const pattern = getCompiledPattern(schema.traceIdExtractPattern);
  const match = pattern.exec(raw);
  return match?.[1] ?? raw;
}

/**
 * Cache pattern→RegExp per evitare la ricompilazione ad ogni riga.
 * In esecuzioni con migliaia di righe (query AccessLog su finestre lunghe)
 * eliminare la ricompilazione riduce il costo aggregato in modo apprezzabile.
 */
const COMPILED_PATTERNS = new Map<string, RegExp>();

function getCompiledPattern(pattern: string): RegExp {
  const cached = COMPILED_PATTERNS.get(pattern);
  if (cached !== undefined) return cached;
  const compiled = new RegExp(pattern);
  COMPILED_PATTERNS.set(pattern, compiled);
  return compiled;
}
