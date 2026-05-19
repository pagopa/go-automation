import type { ResultField } from '@go-automation/go-common/aws';

/**
 * Extracts a field value from a CloudWatch Logs result row.
 *
 * CloudWatch Logs Insights returns each row as an array of `{ field, value }`
 * pairs. This helper looks up a field by name and returns its value (or
 * `undefined` if the field is not present in the row).
 *
 * @param row - A single result row (array of ResultField)
 * @param fieldName - The field name to look for
 * @returns The field value, or `undefined` if not found
 */
export function extractCwField(row: ReadonlyArray<ResultField>, fieldName: string): string | undefined {
  const field = row.find((f) => f.field === fieldName);
  return field?.value ?? undefined;
}
