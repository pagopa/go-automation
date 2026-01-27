/**
 * CSV List Importer - Generic CSV importer for any list of objects
 * Optimized for large files using streaming
 */

import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import type { GOListImporter } from '../GOListImporter.js';
import type { GOListImporterResult } from '../GOListImporterResult.js';
import type { GOCSVListImporterOptions } from './GOCSVListImporterOptions.js';
import { GOEventEmitterBase } from '../../events/GOEventEmitterBase.js';
import type { GOListImporterEventMap } from '../GOListImporterEvents.js';

/**
 * Generic CSV List Importer
 * Supports streaming for large files (GB+)
 * Emits events during import for monitoring and logging
 *
 * @template TItem - The type of items to import
 */
export class GOCSVListImporter<TItem extends Record<string, any> = Record<string, any>>
  extends GOEventEmitterBase<GOListImporterEventMap<TItem>>
  implements GOListImporter<TItem>
{
  // Cached parser options to avoid recalculation
  private parserOptions?: any;

  constructor(private readonly options: GOCSVListImporterOptions) {
    super();
  }

  /**
   * Import CSV items from file or buffer
   *
   * @param source - CSV file path or Buffer
   * @returns Import result with items
   */
  async import(source: string | Buffer): Promise<GOListImporterResult<TItem>> {
    const startTime = Date.now();
    const items: TItem[] = [];
    const errors: { itemIndex: number; itemData: any; message: string }[] = [];
    const skipInvalidItems = this.options.skipInvalidItems ?? false;

    let processedItems = 0;
    let invalidItems = 0;

    // Emit import started event
    const currentSource = typeof source === 'string' ? source : 'buffer';
    this.emit('import:started', { source: currentSource, mode: 'batch' });

    // Use streaming for file paths, parse directly for buffers
    if (typeof source === 'string') {
      // Stream mode for files - more efficient, avoid loading all in memory
      for await (const item of this.importStream(source)) {
        items.push(item);
      }
      // Stats are emitted by importStream
      return {
        items,
        itemCount: processedItems + invalidItems,
        stats: {
          totalItems: items.length,
          invalidItems: 0, // Tracked in stream
          duration: Date.now() - startTime,
        },
      };
    }

    // Buffer mode (parse all at once)
    const records = await this.parseCSVBuffer(source);
    const totalItems = records.length;

    // Process each item
    for (let i = 0; i < totalItems; i++) {
      processedItems++;

      try {
        const item = this.transformItem(records[i]);
        items.push(item);
        this.emit('import:item', { item, index: i });
      } catch (error: any) {
        invalidItems++;

        // Emit error event
        const importError = { itemIndex: i + 1, itemData: records[i], message: error.message };
        const finalError = error instanceof Error ? error : new Error(String(error));

        // Emit error event
        this.emit('import:error', { ...importError, error: finalError });

        if (skipInvalidItems) {
          errors.push(importError);
        } else {
          throw error;
        }
      }

      this.emit('import:progress', {
        processedItems,
        invalidItems,
        totalItems,
        percentage: Math.round((processedItems / totalItems) * 100),
      });
    }

    const duration = Date.now() - startTime;
    const validItems = items.length;

    // Emit completion event
    this.emit('import:completed', { totalItems: validItems, invalidItems, duration });

    return {
      items,
      itemCount: totalItems,
      stats: { totalItems: validItems, invalidItems, duration },
      errors,
    };
  }

  /**
   * Import items in streaming mode
   */
  async *importStream(source: string): AsyncGenerator<TItem, void, unknown> {
    if (typeof source !== 'string') {
      throw new Error('Streaming mode only supports file paths, not buffers');
    }

    const skipInvalidItems = this.options.skipInvalidItems ?? false;

    let processedItems = 0;
    let validItems = 0;
    let invalidItems = 0;

    this.emit('import:started', { source, mode: 'stream' });

    const stream = createReadStream(source, { encoding: this.options.encoding ?? 'utf8' });
    const parser = stream.pipe(parse(this.getParserOptions()));

    for await (const record of parser) {
      processedItems++;

      try {
        const item = this.transformItem(record);
        validItems++;
        this.emit('import:item', { item, index: validItems - 1 });

        yield item;
      } catch (error: any) {
        invalidItems++;

        // Emit error event
        this.emit('import:error', {
          itemIndex: processedItems,
          itemData: record,
          message: error.message,
          error: error instanceof Error ? error : new Error(error.message),
        });

        if (!skipInvalidItems) {
          throw error;
        }
      }

      this.emit('import:progress', { processedItems, invalidItems, percentage: undefined });
    }

    // Emit final progress
    this.emit('import:progress', {
      processedItems,
      invalidItems,
      totalItems: validItems,
      percentage: 100,
    });

    // Emit completion event
    this.emit('import:completed', { totalItems: validItems, invalidItems, duration: 0 }); // Duration calculated externally for streams
  }

  /**
   * Get parser options (cached for performance)
   */
  private getParserOptions(): any {
    if (!this.parserOptions) {
      const delimiter = this.options.delimiter ?? ',';
      const hasHeaders = this.options.hasHeaders ?? true;
      const skipHeaderRows = this.options.skipHeaderRows ?? 0;

      this.parserOptions = {
        delimiter,
        columns: this.options.columns ?? hasHeaders,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        relax_column_count: true,
        // Skip lines before the header (useful for multi-line headers or metadata)
        from_line: skipHeaderRows + 1,
      };
    }
    return this.parserOptions;
  }

  /**
   * Parse CSV from buffer
   */
  private async parseCSVBuffer(buffer: Buffer): Promise<any[]> {
    return new Promise((resolve, reject) => {
      parse(buffer, this.getParserOptions(), (error, records) => {
        if (error) {
          reject(error);
        } else {
          resolve(records);
        }
      });
    });
  }

  /**
   * Validate and transform raw CSV record to typed item
   */
  private transformItem(record: any): TItem {
    // Preserve original record before any transformation if enabled
    const originalRow = this.options.preserveOriginalData ? { ...record } : undefined;

    let item = { ...record };

    // Step 1: Apply column mapping (rename columns)
    if (this.options.columnMapping) {
      const mapped: Record<string, any> = {};

      for (const [sourceKey, value] of Object.entries(item)) {
        // Use mapped name if available, otherwise keep original
        const targetKey = this.options.columnMapping[sourceKey] ?? sourceKey;
        mapped[targetKey] = value;
      }

      item = mapped;
    }

    // Step 2: Apply default values (for missing or empty columns)
    if (this.options.defaultValues) {
      for (const [key, defaultValue] of Object.entries(this.options.defaultValues)) {
        // Only apply default if value is undefined, null, or empty string
        if (item[key] === undefined || item[key] === null || item[key] === '') {
          item[key] = defaultValue;
        }
      }
    }

    // Step 3: Validate (throws error if invalid)
    if (this.options.rowValidator) {
      this.options.rowValidator(item);
    }

    // Step 4: Transform (if validator passed)
    if (this.options.rowTransformer) {
      item = this.options.rowTransformer(item);
    }

    // Step 5: Attach original row data if preserveOriginalData is enabled
    if (originalRow) {
      item._originalRow = originalRow;
    }

    return item as TItem;
  }
}

// async function countLinesStream(filePath: string): Promise<number> {
//   return new Promise((resolve, reject) => {
//     let count = 0;
//     const stream = createReadStream(filePath);

//     stream.on('data', (chunk) => {
//       // Scansioniamo il buffer binario cercando il byte 10 (\n)
//       for (let i = 0; i < chunk.length; i++) {
//         if (chunk[i] === 10) count++;
//       }
//     });

//     stream.on('end', () => { resolve(count); });
//     stream.on('error', (err) => reject(err));
//   });

// }

//  // Esempio di utilizzo
//  countLinesStream('./notifications-100000.csv').then(count => {
//        console.log(`Righe trovate: ${count}`);

// });
