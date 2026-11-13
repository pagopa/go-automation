import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

/**
 * Reads a CloudWatch Logs Insights result from an untyped step output.
 *
 * Invalid rows are skipped and invalid fields inside otherwise valid rows are
 * filtered out. A non-array step output is treated as missing.
 */
export function readCloudWatchResultRows(
  value: unknown,
): ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>> | undefined {
  if (!Array.isArray(value)) return undefined;

  const rows: GOLogsInsightsResultField[][] = [];
  for (const row of value) {
    if (!Array.isArray(row)) continue;
    const fields = row.filter(isResultField);
    if (fields.length > 0) rows.push(fields);
  }
  return rows;
}

function isResultField(value: unknown): value is GOLogsInsightsResultField {
  if (typeof value !== 'object' || value === null) return false;

  const field = value as Readonly<Record<string, unknown>>;
  return typeof field['field'] === 'string' && (field['value'] === undefined || typeof field['value'] === 'string');
}
