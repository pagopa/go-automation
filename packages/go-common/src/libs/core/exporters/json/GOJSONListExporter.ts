/**
 * JSON List Exporter - Generic JSON exporter for any list of objects
 */

import * as fs from 'fs';

import { GOEventEmitterBase } from '../../events/GOEventEmitterBase.js';
import { toError } from '../../errors/GOErrorUtils.js';
import type { GOListExporter } from '../GOListExporter.js';
import type { GOListExporterEventMap } from '../GOListExporterEvents.js';
import type { GOListExporterStreamWriter } from '../GOListExporterStreamWriter.js';
import type { GOJSONListExporterOptions } from './GOJSONListExporterOptions.js';

/**
 * Generic JSON list exporter
 * Exports any array of objects to JSON or JSONL format
 *
 * Supports two formats:
 * - JSON: Standard JSON array format
 * - JSONL: JSON Lines format (newline-delimited JSON)
 *
 * @template TItem - The type of items to export
 */
export class GOJSONListExporter<TItem extends Record<string, unknown>>
  extends GOEventEmitterBase<GOListExporterEventMap>
  implements GOListExporter<TItem>
{
  private writeStream?: fs.WriteStream;
  private isFirstItem: boolean = true;
  private exportedCount: number = 0;
  private failedCount: number = 0;
  private startTime: number = 0;
  private totalItems?: number | undefined;

  constructor(private readonly options: GOJSONListExporterOptions<TItem>) {
    super();
  }

  /**
   * Check if JSONL format is enabled
   */
  private isJsonl(): boolean {
    return this.options.jsonl ?? false;
  }

  /**
   * Export items in batch mode
   * Uses streaming internally for memory efficiency
   */
  async export(items: TItem[]): Promise<void> {
    this.startTime = Date.now();
    this.exportedCount = 0;
    this.failedCount = 0;
    this.totalItems = items.length;
    this.isFirstItem = true;

    const destination = this.options.outputPath;
    this.emit('export:started', {
      itemCount: items.length,
      destination: destination,
      mode: 'batch',
    });

    const writer = await this.initializeStream();

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
  async exportStream(): Promise<GOListExporterStreamWriter<TItem>> {
    // Reset state
    this.startTime = Date.now();
    this.exportedCount = 0;
    this.failedCount = 0;
    this.isFirstItem = true;
    this.totalItems = undefined;

    // emit export started event
    const destination = this.options.outputPath;
    this.emit('export:started', { itemCount: 0, destination: destination, mode: 'stream' });
    return this.initializeStream();
  }

  /**
   * Initialize streaming
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  private async initializeStream(): Promise<GOListExporterStreamWriter<TItem>> {
    // Create write stream
    const encoding = this.options.encoding ?? 'utf8';
    const destination = this.options.outputPath;
    this.writeStream = fs.createWriteStream(destination, { encoding: encoding });

    // JSONL doesn't need opening bracket
    if (!this.isJsonl()) {
      // Write opening bracket for standard JSON
      this.writeStream.write('[');

      if (this.options.pretty) {
        this.writeStream.write('\n');
      }
    }

    // Return stream writer
    return {
      append: async (item: TItem) => {
        await this.appendItem(item);
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

      // JSONL doesn't need closing bracket
      if (!this.isJsonl()) {
        // Write closing bracket for standard JSON
        if (this.options.pretty) {
          this.writeStream.write('\n]');
        } else {
          this.writeStream.write(']');
        }
      }

      this.writeStream.end();
    });
  }

  /**
   * Append a single item in streaming mode
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  private async appendItem(item: TItem): Promise<void> {
    if (!this.writeStream) {
      throw new Error('Export stream not initialized. Call exportStream() first.');
    }

    const currentIndex = this.exportedCount + this.failedCount;

    try {
      // Transform item
      const transformedItem = this.transformRow(item);

      if (this.isJsonl()) {
        // JSONL format: one JSON object per line
        const jsonItem = JSON.stringify(transformedItem);
        this.writeStream.write(jsonItem);
        this.writeStream.write('\n');
      } else {
        // Standard JSON format
        // Add comma before item (except for first item)
        if (!this.isFirstItem) {
          this.writeStream.write(',');
          if (this.options.pretty) {
            this.writeStream.write('\n');
          }
        } else {
          this.isFirstItem = false;
        }

        // Write item
        let jsonItem: string;
        if (this.options.pretty) {
          const indent = this.options.indent ?? 2;
          const itemJson = JSON.stringify(transformedItem, null, indent);
          // Add 2-space indentation to each line for array item
          jsonItem = `  ${itemJson.replace(/\n/g, '\n  ')}`;
        } else {
          jsonItem = JSON.stringify(transformedItem);
        }

        this.writeStream.write(jsonItem);
      }

      this.exportedCount++;
      this.emit('export:item', { item, index: currentIndex });

      // Emit progress
      const percentage = this.totalItems ? Math.round((this.exportedCount / this.totalItems) * 100) : undefined;
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
      // Otherwise, continue processing (error is logged but not thrown)
    }
  }

  /**
   * Transform row using custom transformer if provided
   */
  private transformRow(item: TItem): TItem {
    if (this.options.rowTransformer) {
      return this.options.rowTransformer(item);
    }
    return item;
  }
}
