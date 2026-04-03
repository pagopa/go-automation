/**
 * Exporter factory for go-json-parser
 *
 * Creates the appropriate GOListExporter based on the requested output format.
 * For CSV, wraps each string value into a single-column record using the
 * extracted field name as the column header.
 */

import { Core } from '@go-automation/go-common';

/**
 * Validates the output format and exports extracted values to a file.
 *
 * @param values - Sorted, deduplicated string values to export
 * @param outputPath - Resolved absolute output file path
 * @param format - Output format (validated by caller via isGOExportFormat)
 * @param fieldName - Extracted field name (used as CSV column header)
 */
export async function exportValues(
  values: ReadonlyArray<string>,
  outputPath: string,
  format: Core.GOExportFormat,
  fieldName: string,
): Promise<void> {
  switch (format) {
    case 'txt': {
      const exporter = new Core.GOFileListExporter({ outputPath });
      await exporter.export(values);
      return;
    }

    case 'json': {
      const exporter = new Core.GOJSONListExporter<string>({ outputPath, pretty: true });
      await exporter.export(values);
      return;
    }

    case 'jsonl': {
      const exporter = new Core.GOJSONListExporter<string>({ outputPath, jsonl: true });
      await exporter.export(values);
      return;
    }

    case 'csv': {
      const rows: ReadonlyArray<Record<string, unknown>> = values.map((v) => ({ [fieldName]: v }));
      const exporter = new Core.GOCSVListExporter<Record<string, unknown>>({
        outputPath,
        includeHeader: true,
        columns: [fieldName],
      });
      await exporter.export(rows);
      return;
    }

    case 'html': {
      const rows: ReadonlyArray<Record<string, unknown>> = values.map((v) => ({ [fieldName]: v }));
      const exporter = new Core.GOHTMLListExporter<Record<string, unknown>>({ outputPath });
      await exporter.export(rows);
      return;
    }

    default: {
      const exhaustiveCheck: never = format;
      throw new Error(`Unhandled format: ${String(exhaustiveCheck)}`);
    }
  }
}
