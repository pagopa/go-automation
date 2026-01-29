/**
 * File List Exporter - Generic file exporter for text content
 * Writes items as text lines to a file
 */

import * as fs from 'fs';
import * as path from 'path';

import { GOEventEmitterBase } from '../../events/GOEventEmitterBase.js';
import { toError } from '../../errors/GOErrorUtils.js';
import type { GOListExporter } from '../GOListExporter.js';
import type { GOListExporterEventMap } from '../GOListExporterEvents.js';
import type { GOListExporterStreamWriter } from '../GOListExporterStreamWriter.js';

import type { GOFileListExporterOptions } from './GOFileListExporterOptions.js';

/**
 * Generic file list exporter
 * Exports text items (strings) to a file, one per line
 */
export class GOFileListExporter
  extends GOEventEmitterBase<GOListExporterEventMap>
  implements GOListExporter<string>
{
  private writeStream?: fs.WriteStream;
  private exportedCount: number = 0;
  private failedCount: number = 0;
  private startTime: number = 0;
  private totalItems?: number | undefined;

  constructor(private readonly options: GOFileListExporterOptions) {
    super();
  }

  /**
   * Export items in batch mode
   */
  async export(items: string[]): Promise<void> {
    this.startTime = Date.now();
    this.exportedCount = 0;
    this.failedCount = 0;
    this.totalItems = items.length;

    const destination = this.options.outputPath;
    this.emit('export:started', {
      itemCount: items.length,
      destination: destination,
      mode: 'batch',
    });

    const writer = this.initializeStream();

    try {
      for (const item of items) {
        await writer.append(item);
      }

      await writer.close();
    } catch (error) {
      // Ensure stream is closed on error
      try {
        await writer.close();
      } catch (closeError) {
        this.emit('export:error', { error: toError(closeError) });
      }

      const finalError = toError(error);
      this.emit('export:error', { error: finalError });
      throw error;
    }
  }

  /**
   * Initialize streaming export mode
   */
  async exportStream(): Promise<GOListExporterStreamWriter<string>> {
    // Reset state
    this.startTime = Date.now();
    this.exportedCount = 0;
    this.failedCount = 0;
    this.totalItems = undefined;

    // Ensure directory exists
    const dir = path.dirname(this.options.outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const destination = this.options.outputPath;
    this.emit('export:started', { itemCount: 0, destination: destination, mode: 'stream' });
    return Promise.resolve(this.initializeStream());
  }

  /**
   * Initialize streaming
   */
  private initializeStream(): GOListExporterStreamWriter<string> {
    // Ensure directory exists
    const dir = path.dirname(this.options.outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create write stream
    const encoding = this.options.encoding ?? 'utf8';
    const destination = this.options.outputPath;
    this.writeStream = fs.createWriteStream(destination, { encoding: encoding });

    // Return stream writer
    return {
      append: async (item: string) => {
        await Promise.resolve(this.appendItem(item));
      },
      close: async () => {
        await this.closeStream();
      },
    };
  }

  /**
   * Close streaming export
   */
  private async closeStream(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.writeStream) {
        resolve();
        return;
      }

      let errorOccurred = false;

      const errorHandler = (error: Error): void => {
        if (!errorOccurred) {
          errorOccurred = true;
          cleanup();
          reject(error);
        }
      };

      const finishHandler = (): void => {
        if (!errorOccurred) {
          cleanup();
          this.emit('export:completed', {
            totalItems: this.exportedCount,
            failedItems: this.failedCount,
            destination: this.options.outputPath,
            duration: Date.now() - this.startTime,
          });
          resolve();
        }
      };

      const cleanup = (): void => {
        this.writeStream?.removeListener('error', errorHandler);
        this.writeStream?.removeListener('finish', finishHandler);
      };

      this.writeStream.on('error', errorHandler);
      this.writeStream.on('finish', finishHandler);

      // End the stream
      this.writeStream.end();
    });
  }

  /**
   * Append a single item in streaming mode
   */
  private async appendItem(item: string): Promise<void> {
    if (!this.writeStream) {
      throw new Error('Export stream not initialized. Call exportStream() first.');
    }

    const currentIndex = this.exportedCount + this.failedCount;

    try {
      const lineSeparator = this.options.lineSeparator ?? '\n';
      const canWrite = this.writeStream.write(item + lineSeparator);

      // If the write buffer is full, wait for drain
      if (!canWrite) {
        await new Promise<void>((resolve) => {
          if (this.writeStream) {
            this.writeStream.once('drain', resolve);
          } else {
            resolve();
          }
        });
      }

      this.exportedCount++;
      this.emit('export:item', { item, index: currentIndex });

      // Emit progress
      const percentage = this.totalItems
        ? Math.round((this.exportedCount / this.totalItems) * 100)
        : undefined;
      this.emit('export:progress', {
        exportedItems: this.exportedCount,
        totalItems: this.totalItems,
        percentage: percentage,
      });
    } catch (error) {
      this.failedCount++;
      const finalError = toError(error);
      this.emit('export:error', { error: finalError, item, index: currentIndex });

      // If skipInvalidItems is false (default), re-throw the error
      if (!this.options.skipInvalidItems) {
        throw error;
      }
    }
  }
}
