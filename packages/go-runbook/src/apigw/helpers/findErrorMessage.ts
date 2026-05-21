import type { ResultField } from '@go-automation/go-common/aws';
import type { ServiceLogSchema } from '../profiles/schemas/ServiceLogSchema.js';
import { scanServiceLogs } from './scanServiceLogs.js';

/**
 * Scans a result set for the most representative "error-like" message.
 *
 * The selector runs two logical passes (fused into the single
 * {@link scanServiceLogs} traversal):
 *
 * 1. Among rows whose level field contains `error` or `warn`, pick the
 *    longest message — an explicit ERROR/WARN level is the strongest signal.
 * 2. If no row carries an ERROR/WARN level, fall back to keyword detection
 *    restricted to rows without a level field (or with ERROR/WARN). This
 *    avoids false positives such as DEBUG entries containing `failedAttempts=0`.
 *
 * @param results - CloudWatch Logs Insights result rows
 * @param schema - schema dei log applicativi (per i nomi dei campi)
 * @returns Il messaggio di errore più lungo trovato, oppure stringa vuota.
 */
export function findErrorMessage(results: ReadonlyArray<ResultField[]>, schema: ServiceLogSchema): string {
  return scanServiceLogs(results, schema).errorMessage;
}
