/**
 * Row List Exporter Factory
 *
 * One exporter per `GOExportFormat`, for the flat list of rows the comparison
 * report writes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  GOCSVListExporter,
  GOHTMLListExporter,
  GOJSONListExporter,
  type GOExportFormat,
  type GOListExporter,
} from '@pagopa/go-common/exporters';

/** Indentation of the pretty-printed `json` format. */
const JSON_INDENT = 2;

/**
 * Builds the exporter for a flat list of rows, creating the output directory.
 *
 * `txt` is written as a tab-separated table: for a list of rows there is no
 * "one string per line" rendering that does not throw columns away.
 *
 * `GOPaths` only joins paths, so `data/<script>/outputs/` may not exist yet on
 * a fresh clone, and the CSV and HTML exporters do not create it.
 *
 * @param outputPath - Resolved absolute path of the file to write
 * @param format - The format to write
 * @returns The exporter for that format
 */
export function createRowListExporter(
  outputPath: string,
  format: GOExportFormat,
): GOListExporter<Record<string, unknown>> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- output path is generated through GOPaths or explicit operator-provided path.
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  switch (format) {
    case 'json':
      return new GOJSONListExporter<Record<string, unknown>>({ outputPath, pretty: true, indent: JSON_INDENT });
    case 'jsonl':
      return new GOJSONListExporter<Record<string, unknown>>({ outputPath, jsonl: true });
    case 'csv':
      return new GOCSVListExporter<Record<string, unknown>>({ outputPath, includeHeader: true, delimiter: ',' });
    case 'txt':
      return new GOCSVListExporter<Record<string, unknown>>({ outputPath, includeHeader: true, delimiter: '\t' });
    case 'html':
      return new GOHTMLListExporter<Record<string, unknown>>({ outputPath });
    default: {
      const exhaustive: never = format;
      throw new Error(`Unsupported export format: ${String(exhaustive)}`);
    }
  }
}
