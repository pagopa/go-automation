/**
 * IUN Parser - Parses IUNs from various input formats
 */

import type { SEND } from '@go-automation/go-common';

/**
 * Parses a raw line into a SENDParsedIun object
 *
 * Handles two formats:
 * - Simple IUN: "ABCD-1234-5678"
 * - IUN with date filter: "ABCD-1234-5678|2024-01-15"
 * - IUN embedded in filename: "IUN_ABCD-1234-5678.RECINDEX_0.xml"
 *
 * @param line - Raw line from input file
 * @returns SENDParsedIun object with iun and optional dateFilter
 *
 * @example
 * ```typescript
 * const parsed = parseIunLine('ABCD-1234-5678|2024-01-15');
 * // { iun: 'ABCD-1234-5678', dateFilter: '2024-01-15' }
 * ```
 */
function parseIunLine(line: string): SEND.SENDParsedIun {
  const trimmed = line.trim();

  // Handle IUN embedded in filename format: IUN_xxx.RECINDEX_yyy
  let iunValue = trimmed;
  if (trimmed.includes('IUN_')) {
    const afterIun = trimmed.split('IUN_')[1];
    if (afterIun) {
      iunValue = afterIun.split('.RECINDEX')[0] ?? afterIun;
    }
  }

  // Check for date filter (format: IUN|DATE)
  if (iunValue.includes('|')) {
    const parts = iunValue.split('|');
    const iun = parts[0]?.trim() ?? '';
    const dateFilter = parts[1]?.trim() ?? null;

    return {
      iun,
      dateFilter,
    };
  }

  return {
    iun: iunValue.trim(),
    dateFilter: null,
  };
}

/**
 * Parses multiple lines and returns unique SENDParsedIun objects
 *
 * Filters out empty lines and duplicates based on the full IUN|date string.
 * Complexity: O(N) where N is the number of lines
 *
 * @param lines - Array of raw lines from input file
 * @returns Array of unique SENDParsedIun objects
 *
 * @example
 * ```typescript
 * const lines = ['IUN1', 'IUN2|2024-01-15', 'IUN1'];
 * const parsed = parseIunLines(lines);
 * // Returns 2 unique SENDParsedIun objects
 * ```
 */
export function parseIunLines(lines: ReadonlyArray<string>): ReadonlyArray<SEND.SENDParsedIun> {
  const seen = new Set<string>();
  const result: SEND.SENDParsedIun[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }

    // Use the original trimmed line as the key for deduplication
    if (seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);

    result.push(parseIunLine(trimmed));
  }

  return result;
}
