import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

/**
 * Builds a Logs Insights result row from field/value pairs, in insertion order.
 *
 * @param fields - Values keyed by field name
 * @returns The row as the query service returns it
 *
 * @example
 * ```typescript
 * const rows = [logRow({ level: 'ERROR', '@message': 'boom' })];
 * ```
 */
export function logRow(fields: Readonly<Record<string, string>>): GOLogsInsightsResultField[] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

/**
 * Builds a Logs Insights row holding only `@timestamp` and `@message`.
 *
 * @param message - Value of `@message`
 * @param timestamp - Value of `@timestamp`
 * @returns The row
 *
 * @example
 * ```typescript
 * const rows = [messageRow('ERROR boom')];
 * ```
 */
export function messageRow(message: string, timestamp = '2026-01-01T00:00:00.000Z'): GOLogsInsightsResultField[] {
  return logRow({ '@timestamp': timestamp, '@message': message });
}
