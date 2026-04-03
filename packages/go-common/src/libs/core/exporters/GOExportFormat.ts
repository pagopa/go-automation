/**
 * Supported export formats
 *
 * Each format corresponds to an exporter class in go-common:
 * - `txt`  → GOFileListExporter (one string per line)
 * - `json` → GOJSONListExporter (JSON array, pretty-printed)
 * - `jsonl` → GOJSONListExporter (one JSON value per line)
 * - `csv`  → GOCSVListExporter (comma-separated values with header)
 * - `html` → GOHTMLListExporter (HTML table)
 */
export type GOExportFormat = 'txt' | 'json' | 'jsonl' | 'csv' | 'html';

/** Tuple of all valid export format values */
export const GO_EXPORT_FORMATS: ReadonlyArray<GOExportFormat> = ['txt', 'json', 'jsonl', 'csv', 'html'];

/**
 * Type guard for GOExportFormat
 *
 * @param value - String to check
 * @returns True if the value is a valid GOExportFormat
 */
export function isGOExportFormat(value: string): value is GOExportFormat {
  return (GO_EXPORT_FORMATS as ReadonlyArray<string>).includes(value);
}

/** File extension for each export format */
export const GO_EXPORT_FORMAT_EXTENSIONS: Readonly<Record<GOExportFormat, string>> = {
  txt: 'txt',
  json: 'json',
  jsonl: 'jsonl',
  csv: 'csv',
  html: 'html',
};
