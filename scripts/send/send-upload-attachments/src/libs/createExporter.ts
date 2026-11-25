/**
 * Exporter factory for the upload output file
 *
 * Creates the appropriate go-common list exporter based on the output format.
 * Every exporter supports incremental writes via exportStream(): records are
 * flushed to disk as uploads complete, not all at the end.
 */

import { GOCSVListExporter, GOJSONListExporter, type GOListExporter } from '@pagopa/go-common/exporters';

import type { UploadFileFormat } from '../types/index.js';

/**
 * Creates the list exporter for the output file
 *
 * No explicit column list is needed for CSV: the upload worker guarantees a
 * uniform key set on every record (input fields + generated fields), and the
 * CSV stream writer derives the header from the first appended record.
 *
 * @param format - Output file format
 * @param outputPath - Resolved absolute output file path
 * @returns Exporter accepting flat export records
 */
export function createExporter(format: UploadFileFormat, outputPath: string): GOListExporter<Record<string, unknown>> {
  switch (format) {
    case 'csv':
      return new GOCSVListExporter<Record<string, unknown>>({
        outputPath,
        includeHeader: true,
        delimiter: ',',
      });

    case 'json':
      return new GOJSONListExporter<Record<string, unknown>>({
        outputPath,
        pretty: true,
      });

    case 'jsonl':
      return new GOJSONListExporter<Record<string, unknown>>({
        outputPath,
        jsonl: true,
      });

    default: {
      const exhaustiveCheck: never = format;
      throw new Error(`Unhandled output format: ${String(exhaustiveCheck)}`);
    }
  }
}
