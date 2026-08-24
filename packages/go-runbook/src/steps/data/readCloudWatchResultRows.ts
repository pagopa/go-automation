import type { ResultField } from '@go-automation/go-common/aws';

/**
 * Reads a CloudWatch Logs Insights result from an untyped step output.
 *
 * Invalid rows are skipped and invalid fields inside otherwise valid rows are
 * filtered out. A non-array step output is treated as missing.
 */
export function readCloudWatchResultRows(
  value: unknown,
): ReadonlyArray<ReadonlyArray<ResultField>> | undefined {
  if (!Array.isArray(value)) return undefined;

  const rows: ResultField[][] = [];
  for (const row of value) {
    if (!Array.isArray(row)) continue;
    rows.push(row.filter(isResultField));
  }
  return rows;
}

function isResultField(value: unknown): value is ResultField {
  return typeof value === 'object' && value !== null && 'field' in value;
}
