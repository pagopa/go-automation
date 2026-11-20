import { type GOLogsInsightsResultField, readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';

/**
 * The identity of an application log row across reads with different projections: `@ptr`, else time and message.
 *
 * @param row - Logs Insights row
 * @returns The identity
 */
export function applicationRowIdentity(row: unknown): string {
  if (!Array.isArray(row)) return String(row);
  const fields = row as ReadonlyArray<GOLogsInsightsResultField>;
  const pointer = readRowField(fields, '@ptr');
  if (pointer !== undefined && pointer !== '') return pointer;
  return `${readRowField(fields, '@timestamp') ?? ''}|${readRowField(fields, '@message') ?? readRowField(fields, 'message') ?? ''}`;
}
