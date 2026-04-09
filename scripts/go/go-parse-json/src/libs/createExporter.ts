/**
 * Exporter factory for go-parse-json
 *
 * Creates the appropriate GOListExporter based on the requested output format.
 */

import { Core } from '@go-automation/go-common';

/**
 * Validates the output format and exports extracted values to a file.
 *
 * @param data - Extracted data objects to export
 * @param outputPath - Resolved absolute output file path
 * @param format - Output format (validated by caller via isGOExportFormat)
 * @param fieldNames - List of extracted field names
 */
export async function exportValues(
  data: ReadonlyArray<Record<string, unknown>>,
  outputPath: string,
  format: Core.GOExportFormat,
  fieldNames: string[],
): Promise<void> {
  switch (format) {
    case 'txt': {
      // For plain text, we take the first field value of each row
      const firstField = fieldNames[0] ?? 'value';
      const lines = data.map((row) => {
        const val = row[firstField];
        return typeof val === 'string' ? val : JSON.stringify(val);
      });
      const exporter = new Core.GOFileListExporter({ outputPath });
      await exporter.export(lines);
      return;
    }

    case 'json': {
      const exporter = new Core.GOJSONListExporter<Record<string, unknown>>({ outputPath, pretty: true });
      await exporter.export(data);
      return;
    }

    case 'jsonl': {
      const exporter = new Core.GOJSONListExporter<Record<string, unknown>>({ outputPath, jsonl: true });
      await exporter.export(data);
      return;
    }

    case 'csv': {
      const exporter = new Core.GOCSVListExporter<Record<string, unknown>>({
        outputPath,
        includeHeader: true,
        columns: fieldNames,
      });
      await exporter.export(data);
      return;
    }

    case 'html': {
      const exporter = new Core.GOHTMLListExporter<Record<string, unknown>>({ outputPath });
      await exporter.export(data);
      return;
    }

    default: {
      const exhaustiveCheck: never = format;
      throw new Error(`Unhandled format: ${String(exhaustiveCheck)}`);
    }
  }
}
