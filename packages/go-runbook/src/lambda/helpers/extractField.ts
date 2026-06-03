import type { ResultField } from '@go-automation/go-common/aws';

/**
 * Reads the value of a CloudWatch Logs Insights field from a result row.
 *
 * @param row - A single result row (array of `{ field, value }`)
 * @param field - Field name (e.g. `@message`, `@timestamp`)
 * @returns The field value, or `undefined` when absent
 */
export function extractField(row: ReadonlyArray<ResultField>, field: string): string | undefined {
  for (const cell of row) {
    if (cell.field === field) return cell.value;
  }
  return undefined;
}
