/**
 * JSON File Exporter - Writes a single JSON object to a file
 *
 * Unlike GOJSONListExporter (which writes arrays/JSONL), this exporter
 * writes a single object or value as a standalone JSON file.
 *
 * Use cases: execution traces, configuration snapshots, report summaries.
 */

import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { finished } from 'node:stream/promises';

import type { GOFileExporter } from '../GOFileExporter.js';
import type { GOJSONFileExporterOptions } from './GOJSONFileExporterOptions.js';
import { GOJSONStreamWriter } from './GOJSONStreamWriter.js';

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
   * The text is written piece by piece ({@link GOJSONStreamWriter}) into a
   * temporary file next to the output, renamed onto the output only when the
   * writing is complete: a value too large for one string is still written,
   * and a failed export leaves the previous file as it was.
   *
   * @param data - Any JSON-serializable value
   */
  async export(data: unknown): Promise<void> {
    const { outputPath, encoding = 'utf-8' } = this.options;
    const pretty = this.options.pretty ?? true;
    const indent = pretty ? (this.options.indent ?? 2) : undefined;

    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    const temporaryPath = path.join(dir, `.${path.basename(outputPath)}.${randomUUID()}.tmp`);
    const stream = createWriteStream(temporaryPath, { encoding, flags: 'wx' });
    const written = finished(stream);
    // Awaited below: the handler only keeps an early failure from being reported as unhandled.
    written.catch(() => undefined);
    try {
      await new GOJSONStreamWriter(indent === undefined ? {} : { indent }).write(data, stream);
      stream.end();
      await written;
      await fs.rename(temporaryPath, outputPath);
    } catch (error) {
      stream.destroy();
      await written.catch(() => undefined);
      await fs.rm(temporaryPath, { force: true });
      throw error;
    }
  }
}
