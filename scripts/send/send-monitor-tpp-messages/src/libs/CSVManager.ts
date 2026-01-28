/**
 * CSV Manager
 * Handles CSV file generation and analysis from Athena query results
 */

import * as fsSync from 'fs';
import * as path from 'path';

import { stringify } from 'csv-stringify/sync';
import { DateTime } from 'luxon';

import type { AthenaQueryResults } from '../types/AthenaQueryResults.js';
import type { CSVRow } from '../types/CSVRow.js';

/**
 * Manages CSV file operations including conversion from Athena results,
 * saving to file, and threshold analysis.
 */
export class CSVManager {
  private readonly outputFolder: string;
  private currentFilePath: string | null = null;

  /**
   * Creates a new CSV Manager instance
   * @param outputFolder - Directory path for saving CSV reports
   */
  constructor(outputFolder: string = 'reports') {
    this.outputFolder = outputFolder;
    this.ensureFolderExists();
  }

  /**
   * Ensures the output folder exists, creating it if necessary
   */
  private ensureFolderExists(): void {
    const folderPath = path.resolve(this.outputFolder);
    if (!fsSync.existsSync(folderPath)) {
      fsSync.mkdirSync(folderPath, { recursive: true });
    }
  }

  /**
   * Generates a timestamped filename for the report
   * @param prefix - Filename prefix
   * @returns Generated filename with timestamp
   */
  private generateFileName(prefix: string = 'report'): string {
    const timestamp = DateTime.now().toFormat('yyyy-MM-dd_HH-mm-ss');
    return `${prefix}_${timestamp}.csv`;
  }

  /**
   * Converts Athena query results to an array of CSV rows
   * @param athenaResults - Results from Athena query execution
   * @returns Array of CSV row objects
   * @throws Error if results format is invalid
   */
  public convertAthenaResults(athenaResults: AthenaQueryResults): CSVRow[] {
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
   * Saves data to a CSV file
   * @param data - CSV rows or Athena query results to save
   * @param filename - Optional custom filename
   * @returns Path to the saved file, or null if no data to save
   * @throws Error if file save operation fails
   */
  public saveToCSV(data: CSVRow[] | AthenaQueryResults, filename?: string): string | null {
    // Convert Athena results if needed
    let processedData: CSVRow[];
    if ('ResultSet' in data) {
      processedData = this.convertAthenaResults(data);
    } else {
      processedData = data;
    }

    if (!Array.isArray(processedData) || processedData.length === 0) {
      this.currentFilePath = null;
      return null;
    }

    // Generate filename if not provided
    const fileName = filename ?? this.generateFileName();
    this.currentFilePath = path.join(this.outputFolder, fileName);

    // Convert data to CSV using csv-stringify
    const csvContent = stringify(processedData, {
      header: true,
      quoted: true,
      quoted_empty: true,
    });

    // Save file synchronously (could be made async if needed)
    fsSync.writeFileSync(this.currentFilePath, csvContent, 'utf8');

    return this.currentFilePath;
  }

  /**
   * Gets the current file name (without path)
   * @returns Current filename or null if no file has been saved
   */
  public getCurrentFileName(): string | null {
    return this.currentFilePath ? path.basename(this.currentFilePath) : null;
  }

  /**
   * Analyzes data against a threshold value
   * @param data - Array of CSV rows to analyze
   * @param field - Field name to check against threshold
   * @param threshold - Threshold value
   * @returns Array of rows exceeding the threshold
   */
  public analyzeThreshold(data: ReadonlyArray<CSVRow>, field: string, threshold: number): CSVRow[] {
    if (!Array.isArray(data)) {
      throw new Error('Data must be an array');
    }

    const typedData: ReadonlyArray<CSVRow> = data;
    const flaggedRows: CSVRow[] = [];

    for (const row of typedData) {
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
   * @param flaggedRows - Rows that exceeded the threshold
   * @param field - Field name that was analyzed
   * @param threshold - Threshold value used
   * @returns Formatted report string
   */
  public generateThresholdReport(
    flaggedRows: ReadonlyArray<CSVRow>,
    field: string,
    threshold: number,
  ): string {
    if (!flaggedRows || flaggedRows.length === 0) {
      return `No rows exceed the threshold of ${threshold} for field '${field}'`;
    }

    return `Found ${flaggedRows.length} rows exceeding the threshold of ${threshold} for field '${field}'`;
  }
}
