import type { ResultField } from '@go-automation/go-common/aws';

export function extractFirst(row: ReadonlyArray<ResultField>, fields: ReadonlyArray<string>): string | undefined {
  for (const fieldName of fields) {
    const value = row.find((field) => field.field === fieldName)?.value;
    if (value !== undefined && value.trim() !== '') {
      return value;
    }
  }
  return undefined;
}
