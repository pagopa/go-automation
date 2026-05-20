import type { ResultField } from '@go-automation/go-common/aws';
import type { ServiceLogSchema } from '../profiles/schemas/ServiceLogSchema.js';
import { extractCwField } from './extractCwField.js';
import { readMessageField } from './readMessageField.js';

/**
 * Keyword tokens that flag a message as "error-like" in the second pass
 * of {@link findErrorMessage}.
 *
 * Includes:
 * - Generic exception/error/failure markers used by application logs.
 * - Lambda runtime markers (`Status: timeout`, `Status: error`) emitted
 *   in `REPORT` lines: those rows do not carry a `level` field and would
 *   otherwise be invisible to the heuristic. The probe queries that
 *   surface them already filter by `@duration` so a match here is
 *   diagnostic rather than incidental.
 */
const ERROR_KEYWORDS: ReadonlyArray<string> = [
  'Exception',
  'Error',
  'failed',
  'FAILURE',
  'Status: timeout',
  'Status: error',
];

/**
 * Scans a result set for the most representative "error-like" message.
 *
 * The selector runs two passes:
 *
 * 1. Among rows whose level field contains `error` or `warn`, pick the
 *    longest message. The level field is the strongest signal — a row
 *    explicitly logged as ERROR or WARN by the application is more
 *    trustworthy than a keyword heuristic.
 * 2. If no row carries an ERROR/WARN level, fall back to keyword
 *    detection ({@link ERROR_KEYWORDS}) restricted to rows that do
 *    **not** declare a non-error level (only rows without a level field
 *    or with ERROR/WARN are eligible). This avoids false positives such
 *    as DEBUG entries containing words like `failedAttempts=0`.
 *
 * Complessità: O(N) sul numero di righe.
 *
 * @param results - CloudWatch Logs Insights result rows
 * @param schema - schema dei log applicativi (per i nomi dei campi)
 * @returns Il messaggio di errore più lungo trovato, oppure stringa vuota.
 */
export function findErrorMessage(results: ReadonlyArray<ResultField[]>, schema: ServiceLogSchema): string {
  let bestByLevel = '';
  for (const row of results) {
    const message = readMessageField(row, schema);
    if (message === '') continue;
    const level = (extractCwField(row, schema.levelField) ?? '').toLowerCase();
    if ((level.includes('error') || level.includes('warn')) && message.length > bestByLevel.length) {
      bestByLevel = message;
    }
  }
  if (bestByLevel !== '') {
    return bestByLevel;
  }

  let bestByKeyword = '';
  for (const row of results) {
    const message = readMessageField(row, schema);
    if (message === '') continue;
    const level = (extractCwField(row, schema.levelField) ?? '').toLowerCase();
    if (level !== '' && !level.includes('error') && !level.includes('warn')) {
      continue;
    }
    const hasErrorKeywords = ERROR_KEYWORDS.some((kw) => message.includes(kw));
    if (hasErrorKeywords && message.length > bestByKeyword.length) {
      bestByKeyword = message;
    }
  }
  return bestByKeyword;
}
