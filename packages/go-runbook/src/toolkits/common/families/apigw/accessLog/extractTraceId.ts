import { readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { compileRegex } from '@pagopa/go-common/utils';

import type { TraceIdReaderFn } from '../types/TraceIdReaderFn.js';
import type { AccessLogSchema } from './AccessLogSchema.js';
import type { CloudWatchLogsRow } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';

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
export function extractTraceId(row: CloudWatchLogsRow, schema: AccessLogSchema): string | undefined {
  return traceIdReader(schema)(row);
}

/**
 * Lettore del trace id delle righe di AccessLog di uno schema, con il pattern
 * di estrazione compilato una volta: da usare quando si leggono molte righe.
 *
 * @param schema - schema dei campi AccessLog (per `traceIdField` e
 *                 `traceIdExtractPattern`)
 * @returns il lettore, con lo stesso risultato di {@link extractTraceId}
 * @throws Error quando `traceIdExtractPattern` non è un'espressione regolare valida
 *
 * @example
 * ```typescript
 * const readTraceId = traceIdReader(schema);
 * const traceIds = rows.map((row) => readTraceId(row));
 * ```
 */
export function traceIdReader(schema: AccessLogSchema): TraceIdReaderFn {
  const pattern = schema.traceIdExtractPattern === undefined ? undefined : compileRegex(schema.traceIdExtractPattern);
  return (row) => {
    const raw = readRowField(row, schema.traceIdField);
    if (raw === undefined || pattern === undefined) return raw;
    return pattern.exec(raw)?.[1] ?? raw;
  };
}
