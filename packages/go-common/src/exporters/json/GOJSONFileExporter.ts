/**
 * JSON File Exporter - Writes a single JSON object to a file
 *
 * Unlike GOJSONListExporter (which writes arrays/JSONL), this exporter
 * writes a single object or value as a standalone JSON file.
 *
 * Use cases: execution traces, configuration snapshots, report summaries.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import type { GOFileExporter } from '../GOFileExporter.js';
import type { GOJSONFileExporterOptions } from './GOJSONFileExporterOptions.js';

/**
 * Exports a single JSON-serializable value to a file
 *
 * @example
 * ```typescript
 * const exporter = new GOJSONFileExporter({ outputPath: '/tmp/trace.json', pretty: true });
 * await exporter.export(traceObject);
 * ```
 */
export class GOJSONFileExporter implements GOFileExporter<unknown> {
  constructor(private readonly options: GOJSONFileExporterOptions) {}

  /**
   * Writes a single value as JSON to the configured output path.
   * Creates parent directories if they do not exist.
   *
   * @param data - Any JSON-serializable value
   */
  async export(data: unknown): Promise<void> {
    const { outputPath, encoding = 'utf-8' } = this.options;
    const pretty = this.options.pretty ?? true;
    const indent = pretty ? (this.options.indent ?? 2) : undefined;

    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    const json = JSON.stringify(data, null, indent);
    await fs.writeFile(outputPath, json, encoding);
  }
}
