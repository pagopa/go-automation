/**
 * Binary File Exporter - Writes raw binary data (Buffer / Uint8Array) to a file.
 *
 * Creates parent directories automatically.
 *
 * Use cases: S3 object downloads, file attachments, binary payloads.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import type { GOFileExporter } from '../GOFileExporter.js';
import type { GOBinaryFileExporterOptions } from './GOBinaryFileExporterOptions.js';

/**
 * Exports binary data to a file on disk.
 *
 * @example
 * ```typescript
 * const exporter = new GOBinaryFileExporter({ outputPath: '/tmp/downloads/file.pdf' });
 * await exporter.export(buffer);
 * ```
 */
export class GOBinaryFileExporter implements GOFileExporter<Buffer | Uint8Array> {
  constructor(private readonly options: GOBinaryFileExporterOptions) {}

  /**
   * Writes binary data to the configured output path.
   * Creates parent directories if they do not exist.
   *
   * @param data - Binary content to write
   */
  async export(data: Buffer | Uint8Array): Promise<void> {
    const dir = path.dirname(this.options.outputPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.options.outputPath, data);
  }
}
