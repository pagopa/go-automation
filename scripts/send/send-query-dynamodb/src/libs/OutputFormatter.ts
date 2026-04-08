/**
 * Output Formatter - Formats query results into various formats
 *
 * Supports JSON, NDJSON, CSV, and Plain Text formats.
 * Maps input partition keys to their corresponding results.
 */

import { Core } from '@go-automation/go-common';

/**
 * Result mapping: PK -> array of items
 */
type ResultMap = Record<string, unknown[]>;

/**
 * Formats results into a pretty-formatted JSON string for console output.
 * Contains only PK-to-result mapping.
 *
 * @param resultMap - The mapping of PKs to results
 * @returns Pretty-formatted JSON string
 */
export function formatConsoleJson(resultMap: ResultMap): string {
  return JSON.stringify(resultMap, null, 2);
}

/**
 * Formats results for CSV output (attributes only).
 *
 * @param resultMap - The mapping of PKs to results
 * @param pkKey - The name of the PK attribute in the mapping
 * @returns Array of objects ready for CSV export
 */
export function formatForCsv(resultMap: ResultMap, pkKey: string): Record<string, unknown>[] {
  const flatResults: Record<string, unknown>[] = [];

  for (const [pk, items] of Object.entries(resultMap)) {
    if (items.length === 0) {
      // Optional: include PK even if no results?
      // For CSV it might be useful to show the PK with empty attrs
      flatResults.push({ [pkKey]: pk });
    } else {
      for (const item of items) {
        flatResults.push({
          [pkKey]: pk,
          ...(item as Record<string, unknown>),
        });
      }
    }
  }

  return flatResults;
}

/**
 * Formats results for Plain Text output (attributes only).
 *
 * @param resultMap - The mapping of PKs to results
 * @returns Plain text string
 */
export function formatForText(resultMap: ResultMap): string {
  let output = '';

  for (const [pk, items] of Object.entries(resultMap)) {
    if (items.length === 0) {
      output += `${pk}: (no results)\n`;
    } else {
      for (const item of items) {
        const attrValues = Object.values(item as Record<string, unknown>)
          .map((val) => Core.valueToString(val))
          .join(', ');
        output += `${pk}: ${attrValues}\n`;
      }
    }
  }

  return output;
}
