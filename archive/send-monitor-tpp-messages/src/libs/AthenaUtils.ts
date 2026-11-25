/**
 * Athena result conversion and threshold analysis utilities
 * Pure functions for processing query results — CSV export is handled by GOCSVListExporter
 */

import type { AthenaQueryResults } from '../types/AthenaQueryResults.js';
import type { CSVRow } from '../types/CSVRow.js';

/**
 * Converts Athena query results to an array of CSV rows
 * First row is treated as headers, subsequent rows as data
 * Complexity: O(R * C) where R = rows and C = columns
 *
 * @param athenaResults - Results from Athena query execution
 * @returns Array of CSV row objects
 * @throws Error if results format is invalid
 */
export function convertAthenaResults(athenaResults: AthenaQueryResults): CSVRow[] {
  if (!athenaResults?.ResultSet?.Rows) {
    throw new Error('Invalid Athena results format');
  }

  const rows = athenaResults.ResultSet.Rows;
  if (rows.length === 0) {
    return [];
  }

  // First row contains headers
  const headerRow = rows[0];
  if (!headerRow?.Data) {
    throw new Error('Header row is invalid or missing');
  }
  const headers = headerRow.Data.map((col) => col.VarCharValue ?? '');

  // Subsequent rows contain data
  const data: CSVRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.Data) {
      continue;
    }
    const rowData: CSVRow = {};

    for (const [index, col] of row.Data.entries()) {
      const header = headers[index];
      if (header) {
        rowData[header] = col.VarCharValue ?? '';
      }
    }

    data.push(rowData);
  }

  return data;
}

/**
 * Filters rows where a numeric field exceeds a threshold
 * Complexity: O(N) where N is the number of rows
 *
 * @param data - Array of CSV rows to analyze
 * @param field - Field name to check against threshold
 * @param threshold - Threshold value
 * @returns Array of rows exceeding the threshold
 */
export function analyzeThreshold(data: ReadonlyArray<CSVRow>, field: string, threshold: number): CSVRow[] {
  const flaggedRows: CSVRow[] = [];

  for (const row of data) {
    const fieldValue: string | undefined = field in row ? row[field] : undefined;
    if (fieldValue === undefined) {
      continue;
    }
    const value = parseFloat(fieldValue);
    if (!isNaN(value) && value > threshold) {
      flaggedRows.push(row);
    }
  }

  return flaggedRows;
}

/**
 * Generates a human-readable threshold report
 *
 * @param flaggedRows - Rows that exceeded the threshold
 * @param field - Field name that was analyzed
 * @param threshold - Threshold value used
 * @returns Formatted report string
 */
export function generateThresholdReport(flaggedRows: ReadonlyArray<CSVRow>, field: string, threshold: number): string {
  if (flaggedRows.length === 0) {
    return `No rows exceed the threshold of ${threshold} for field '${field}'`;
  }

  return `Found ${flaggedRows.length} rows exceeding the threshold of ${threshold} for field '${field}'`;
}
