/**
 * Saves query results to CSV and performs threshold analysis.
 */

import * as path from 'path';

import { DateTime } from 'luxon';

import { Core } from '@go-automation/go-common';

import { analyzeThreshold, generateThresholdReport } from './AthenaUtils.js';
import type { CSVRow } from '../types/CSVRow.js';

/**
 * Result of saving and analyzing query data.
 */
interface SaveAnalysisResult {
  readonly csvFilePath: string | null;
  readonly fileName: string | null;
  readonly rowCount: number;
  readonly analysis: string;
}

/**
 * Generates a timestamped filename for the CSV report.
 *
 * @param prefix - Filename prefix
 * @returns Generated filename with timestamp
 */
function generateFileName(prefix: string = 'report'): string {
  const timestamp = DateTime.now().toFormat('yyyy-MM-dd_HH-mm-ss');
  return `${prefix}_${timestamp}.csv`;
}

/**
 * Saves results to CSV using GOCSVListExporter and analyzes them.
 *
 * @param data - Converted CSV rows
 * @param outputFolder - Directory for CSV output
 * @param thresholdField - Optional field to analyze
 * @param threshold - Threshold value
 * @returns Analysis results with file path and report
 */
export async function saveAndAnalyzeResults(
  data: CSVRow[],
  outputFolder: string,
  thresholdField?: string,
  threshold?: number,
): Promise<SaveAnalysisResult> {
  const rowCount = data.length;

  let csvFilePath: string | null = null;
  let fileName: string | null = null;

  if (rowCount > 0) {
    fileName = generateFileName();
    csvFilePath = path.join(outputFolder, fileName);

    const exporter = new Core.GOCSVListExporter<CSVRow>({
      outputPath: csvFilePath,
      includeHeader: true,
    });
    await exporter.export(data);
  }

  let analysis: string;
  if (rowCount === 0) {
    analysis = 'No data found in the specified time range';
  } else if (thresholdField && threshold !== undefined && threshold > 0) {
    const flaggedRows = analyzeThreshold(data, thresholdField, threshold);
    analysis = generateThresholdReport(flaggedRows, thresholdField, threshold);
  } else {
    analysis = `Found ${rowCount} rows`;
  }

  return { csvFilePath, fileName, rowCount, analysis };
}
