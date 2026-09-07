import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';

/**
 * Field access for CloudWatch Logs Insights results.
 *
 * Insights returns each row as an array of `{ field, value }` pairs rather
 * than an object, so reading a field means scanning the row. These helpers
 * exist so every caller scans it the same way.
 */

/**
 * Reads one field from a result row.
 *
 * Complexity: O(F) over the fields of the row.
 *
 * @param row - A single result row
 * @param fieldName - Field name to look up (e.g. `@message`, `@timestamp`)
 * @returns The raw field value, or `undefined` when the field is absent
 *
 * @example
 * ```typescript
 * const message = readRowField(row, '@message');
 * ```
 */
export function readRowField(row: ReadonlyArray<ResultField>, fieldName: string): string | undefined {
  for (const field of row) {
    if (field.field === fieldName) return field.value;
  }
  return undefined;
}

/**
 * Reads every value in the row whose field name is one of `fieldNames`.
 *
 * Useful when a query projects the same information under more than one name
 * (`@message` / `message` / `log`) and the caller wants all the candidates.
 * Complexity: O(F) over the fields of the row.
 *
 * @param row - A single result row
 * @param fieldNames - Field names to collect
 * @returns The values found, in row order; empty when none match
 */
export function readRowFields(
  row: ReadonlyArray<ResultField>,
  fieldNames: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const names = new Set(fieldNames);
  const values: string[] = [];
  for (const field of row) {
    if (field.field === undefined || !names.has(field.field)) continue;
    if (field.value !== undefined) values.push(field.value);
  }
  return values;
}

/**
 * Reads an Insights result set out of an untyped value.
 *
 * A non-array input is treated as no rows. Rows are kept even when every
 * field inside them is discarded, so a caller counting rows still sees how
 * many entries the query returned.
 *
 * @param value - Raw value, typically an untyped query or step output
 * @returns The rows, or an empty array when the value is not a result set
 */
export function readResultFieldRows(value: unknown): ReadonlyArray<ReadonlyArray<ResultField>> {
  if (!Array.isArray(value)) return [];
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
