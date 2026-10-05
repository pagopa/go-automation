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
      if (field.field === fieldName && field.value) {
        const match = readLogMessage(field.value).match(/Getting file\s+["']?([^\s"']+)/u);
        if (match?.[1]) {
          return match[1];
        }
      }
    }
  }
  return '';
}

/** Read the application log, avoiding JSON envelope fields in the S3 key. */
function readLogMessage(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null && 'log' in parsed && typeof parsed.log === 'string') {
      return parsed.log;
    }
    return '';
  } catch {
    return value;
  }
}
