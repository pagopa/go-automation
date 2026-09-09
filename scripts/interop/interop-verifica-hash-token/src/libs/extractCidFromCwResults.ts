import type { AWS } from '@go-automation/go-common';

/**
 * Extracts the Correlation ID (CID) from query results
 */
export function extractCidFromCwResults(
  results: ReadonlyArray<ReadonlyArray<AWS.ResultField>>,
  fieldName: string,
): string {
  for (const row of results) {
    for (const field of row) {
      if (field.field === fieldName && field.value) {
        const match = field.value.match(/\[CID=([^\]]+)\]/);
        if (match?.[1]) {
          return match[1];
        }
      }
    }
  }
  return '';
}
