import type { AWS } from '@go-automation/go-common';

/**
 * Extracts the file name from query results
 */
export function extractFileNameFromCwResults(
  results: ReadonlyArray<ReadonlyArray<AWS.ResultField>>,
  fieldName: string,
): string {
  for (const row of results) {
    for (const field of row) {
      if (field.field === fieldName && field.value?.includes('Getting file')) {
        const match = field.value.match(/Getting file\s+(\S+)/);
        if (match?.[1]) {
          return match[1];
        }
      }
    }
  }
  return '';
}
