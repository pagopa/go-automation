/**
 * JSON List Importer - Generic JSON importer for any list of objects
 */

import * as fs from 'fs';
import type { GOListImporter } from '../GOListImporter.js';
import type { GOListImporterResult } from '../GOListImporterResult.js';
import type { GOJSONListImporterOptions } from './GOJSONListImporterOptions.js';
import { GOEventEmitterBase } from '../../events/GOEventEmitterBase.js';
import type { GOListImporterEventMap } from '../GOListImporterEvents.js';

/**
 * Generic JSON List Importer
 * Parses JSON arrays from files or buffers
 * Emits events during import for monitoring and logging
 *
 * @template TItem - The type of items to import
 */
export class GOJSONListImporter<TItem = any>
  extends GOEventEmitterBase<GOListImporterEventMap<TItem>>
  implements GOListImporter<TItem>
{
  constructor(private readonly options: GOJSONListImporterOptions = {}) {
    super();
  }

  /**
   * Import JSON items from file or buffer
   *
   * @param source - JSON file path or Buffer
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

    try {
      // Parse JSON data
      const data = await this.parseJSON(source);
      const totalItems = data.length;

      // Process each item
      for (let i = 0; i < totalItems; i++) {
        processedItems++;

        try {
          const item = this.transformItem(data[i]);
          items.push(item);
          this.emit('import:item', { item, index: i });
        } catch (error: any) {
          invalidItems++;
          const importError = {
            itemIndex: i + 1,
            itemData: data[i],
            message: error.message,
          };

          // Emit error event
          const finalError = error instanceof Error ? error : new Error(String(error));
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
      this.emit('import:completed', {
        totalItems: validItems,
        invalidItems,
        duration,
      });

      return {
        items,
        stats: {
          totalItems: validItems,
          invalidItems,
          duration,
        },
        errors,
      };
    } catch (error: any) {
      const finalError = error instanceof Error ? error : new Error(String(error));
      this.emit('import:error', {
        itemIndex: 0,
        itemData: null,
        message: finalError.message,
        error: finalError,
      });
      throw finalError;
    }
  }

  /**
   * Import items in streaming mode
   * Note: JSON doesn't support true streaming, so this loads all data and yields items one by one
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

    try {
      // Parse JSON data
      const data = await this.parseJSON(source);
      const totalItems = data.length;

      // Process and yield each item
      for (let i = 0; i < totalItems; i++) {
        processedItems++;

        try {
          const item = this.transformItem(data[i]);
          validItems++;

          // Emit item event only if there are listeners
          if (this.listenerCount('import:item') > 0) {
            this.emit('import:item', { item, index: validItems - 1 });
          }

          yield item;
        } catch (error: any) {
          invalidItems++;

          // Emit error event
          this.emit('import:error', {
            itemIndex: processedItems,
            itemData: data[i],
            message: error.message,
            error: error instanceof Error ? error : new Error(error.message),
          });

          if (!skipInvalidItems) {
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

      // Emit completion event
      this.emit('import:completed', {
        totalItems: validItems,
        invalidItems,
        duration: 0, // Duration calculated externally for streams
      });
    } catch (error: any) {
      const finalError = error instanceof Error ? error : new Error(String(error));
      this.emit('import:error', {
        itemIndex: 0,
        itemData: null,
        message: finalError.message,
        error: finalError,
      });
      throw finalError;
    }
  }

  /**
   * Parse JSON from source and extract array
   * Shared logic between import() and importStream()
   */
  private async parseJSON(source: string | Buffer): Promise<any[]> {
    // Read content
    const content =
      typeof source === 'string'
        ? await fs.promises.readFile(source, { encoding: this.options.encoding ?? 'utf8' })
        : source.toString(this.options.encoding ?? 'utf8');

    // Parse JSON
    let data = JSON.parse(content);

    // Extract array from nested structure if jsonPath is provided
    if (this.options.jsonPath) {
      data = this.extractFromPath(data, this.options.jsonPath);
    }

    // Ensure data is an array
    if (!Array.isArray(data)) {
      throw new Error('JSON content must be an array or contain an array at the specified path');
    }

    return data;
  }

  /**
   * Extract data from nested object using path
   */
  private extractFromPath(data: any, path: string): any {
    const keys = path.split('.');
    let result = data;

    for (const key of keys) {
      if (result && typeof result === 'object' && key in result) {
        result = result[key];
      } else {
        throw new Error(`Path "${path}" not found in JSON data`);
      }
    }

    return result;
  }

  /**
   * Validate and transform raw item to typed item
   */
  private transformItem(item: any): TItem {
    // Step 1: Validate (throws error if invalid)
    if (this.options.itemValidator) {
      this.options.itemValidator(item);
    }

    // Step 2: Transform (if validator passed)
    if (this.options.itemTransformer) {
      return this.options.itemTransformer(item) as TItem;
    }

    return item as TItem;
  }
}
