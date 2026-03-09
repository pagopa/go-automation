/**
 * PK Importer - Imports partition keys from multiple file formats
 *
 * Supports TXT (one PK per line), JSONL (one JSON string per line),
 * and CSV (extract PK from a specific column) using go-common importers.
 */

import { Core } from '@go-automation/go-common';

import type { InputFormat } from '../types/index.js';

/**
 * Options for importing partition keys
 */
export interface PkImportOptions {
  /** Input file format */
  readonly format: InputFormat;
  /** CSV column name to extract PKs from (default: first column) */
  readonly csvColumn?: string | undefined;
  /** CSV delimiter character (default: ',') */
  readonly csvDelimiter?: string | undefined;
}

/**
 * Imports partition keys from a file using the appropriate importer
 * based on the input format. Deduplicates and filters empty values.
 *
 * @param filePath - Absolute path to the input file
 * @param options - Import options including format and CSV settings
 * @returns Array of unique, non-empty PK strings
 *
 * @example
 * ```typescript
 * // TXT format (one PK per line)
 * const pks = await importPks('/path/to/pks.txt', { format: 'txt' });
 *
 * // JSONL format (one JSON string per line)
 * const pks = await importPks('/path/to/pks.jsonl', { format: 'jsonl' });
 *
 * // CSV format (extract from column)
 * const pks = await importPks('/path/to/pks.csv', {
 *   format: 'csv',
 *   csvColumn: 'partition_key',
 *   csvDelimiter: ';',
 * });
 * ```
 */
export async function importPks(filePath: string, options: PkImportOptions): Promise<ReadonlyArray<string>> {
  switch (options.format) {
    case 'txt':
      return importFromTxt(filePath);
    case 'jsonl':
      return importFromJsonl(filePath);
    case 'csv':
      return importFromCsv(filePath, options.csvColumn, options.csvDelimiter);
    default: {
      throw new Error(`Unsupported input format: ${Core.valueToString(options.format)}`);
    }
  }
}

/**
 * Imports PKs from a plain text file (one PK per line).
 * Uses GOFileListImporter with trim, skip empty, and deduplication.
 */
async function importFromTxt(filePath: string): Promise<ReadonlyArray<string>> {
  const importer = new Core.GOFileListImporter<string>({
    trim: true,
    skipEmptyLines: true,
    deduplicate: true,
    commentPrefix: '#',
  });

  const result = await importer.import(filePath);
  return result.items;
}

/**
 * Imports PKs from a JSONL file (one JSON string per line).
 * Each line must be a JSON string value (e.g., `"PK-001"`).
 * Uses GOJSONListImporter in jsonl mode with deduplication.
 */
async function importFromJsonl(filePath: string): Promise<ReadonlyArray<string>> {
  const importer = new Core.GOJSONListImporter<string>({
    jsonl: true,
    skipInvalidItems: true,
    rowTransformer: (item) => {
      if (typeof item === 'string') {
        return item.trim();
      }
      throw new Error(`Expected string value, got ${typeof item}`);
    },
  });

  const result = await importer.import(filePath);
  return deduplicateAndFilter(result.items as ReadonlyArray<string>);
}

/**
 * Imports PKs from a CSV file, extracting values from a specific column.
 * If no column name is specified, uses the first column.
 * Uses GOCSVListImporter with deduplication.
 */
async function importFromCsv(
  filePath: string,
  columnName?: string,
  delimiter?: string,
): Promise<ReadonlyArray<string>> {
  const importer = new Core.GOCSVListImporter<string>({
    hasHeaders: true,
    skipInvalidItems: true,
    ...(delimiter !== undefined ? { delimiter } : {}),
    rowTransformer: (record) => {
      const csvRecord = record as unknown as Record<string, string>;
      if (columnName !== undefined) {
        const value = csvRecord[columnName];
        if (value === undefined) {
          throw new Error(`Column '${columnName}' not found in CSV row`);
        }
        return value.trim();
      }
      // Use first column value
      const firstKey = Object.keys(csvRecord)[0];
      if (firstKey === undefined) {
        throw new Error('CSV row has no columns');
      }
      const value = csvRecord[firstKey];
      if (value === undefined) {
        throw new Error('CSV first column value is undefined');
      }
      return value.trim();
    },
  });

  const result = await importer.import(filePath);
  return deduplicateAndFilter(result.items);
}

/**
 * Deduplicates and filters empty strings from an array.
 * Complexity: O(N) using Set
 */
function deduplicateAndFilter(items: ReadonlyArray<string>): ReadonlyArray<string> {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (item !== '' && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}
