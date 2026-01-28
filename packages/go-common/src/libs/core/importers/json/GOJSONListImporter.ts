/**
 * JSON List Importer - Generic JSON importer for any list of objects
 */

import * as fs from 'fs';
import type { GOListImporter } from '../GOListImporter.js';
import type { GOListImporterResult } from '../GOListImporterResult.js';
import type { GOListImportError } from '../GOListImporterResult.js';
import type { GOJSONListImporterOptions } from './GOJSONListImporterOptions.js';
import { GOEventEmitterBase } from '../../events/GOEventEmitterBase.js';
import type { GOListImporterEventMap } from '../GOListImporterEvents.js';
import { getErrorMessage, toError } from '../../errors/GOErrorUtils.js';

/**
 * Generic JSON List Importer
 * Parses JSON arrays from files or buffers
 * Emits events during import for monitoring and logging
 *
 * @template TItem - The type of items to import
 */
export class GOJSONListImporter<TItem = unknown>
  extends GOEventEmitterBase<GOListImporterEventMap<TItem>>
  implements GOListImporter<TItem>
{
  constructor(private readonly options: GOJSONListImporterOptions<unknown, TItem> = {}) {
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
    const errors: GOListImportError[] = [];
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
        const currentItem = data[i];

        // Safety check for undefined (noUncheckedIndexedAccess)
        if (currentItem === undefined) {
          continue;
        }

        try {
          const item = this.transformItem(currentItem);
          items.push(item);
          this.emit('import:item', { item, index: i });
        } catch (error: unknown) {
          invalidItems++;
          const errorMessage = getErrorMessage(error);
          const importError: GOListImportError = {
            itemIndex: i + 1,
            itemData: currentItem,
            message: errorMessage,
          };

          // Emit error event
          const finalError = toError(error);
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
    } catch (error: unknown) {
      const finalError = toError(error);
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
        const currentItem = data[i];

        // Safety check for undefined (noUncheckedIndexedAccess)
        if (currentItem === undefined) {
          continue;
        }

        try {
          const item = this.transformItem(currentItem);
          validItems++;

          // Emit item event only if there are listeners
          if (this.listenerCount('import:item') > 0) {
            this.emit('import:item', { item, index: validItems - 1 });
          }

          yield item;
        } catch (error: unknown) {
          invalidItems++;

          // Emit error event
          const errorMessage = getErrorMessage(error);
          this.emit('import:error', {
            itemIndex: processedItems,
            itemData: currentItem,
            message: errorMessage,
            error: toError(error),
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
    } catch (error: unknown) {
      const finalError = toError(error);
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
  private async parseJSON(source: string | Buffer): Promise<unknown[]> {
    // Read content
    const content =
      typeof source === 'string'
        ? await fs.promises.readFile(source, { encoding: this.options.encoding ?? 'utf8' })
        : source.toString(this.options.encoding ?? 'utf8');

    // Parse JSON
    let data: unknown = JSON.parse(content);

    // Extract array from nested structure if jsonPath is provided
    if (this.options.jsonPath) {
      data = this.extractFromPath(data, this.options.jsonPath);
    }

    // Ensure data is an array
    if (!Array.isArray(data)) {
      throw new Error('JSON content must be an array or contain an array at the specified path');
    }

    return data as unknown[];
  }

  /**
   * Extract data from nested object using path
   */
  private extractFromPath(data: unknown, path: string): unknown {
    const keys = path.split('.');
    let result: unknown = data;

    for (const key of keys) {
      if (result !== null && typeof result === 'object' && key in result) {
        result = (result as Record<string, unknown>)[key];
      } else {
        throw new Error(`Path "${path}" not found in JSON data`);
      }
    }

    return result;
  }

  /**
   * Validate and transform raw item to typed item
   */
  private transformItem(item: unknown): TItem {
    // Step 1: Validate (throws error if invalid)
    if (this.options.itemValidator) {
      this.options.itemValidator(item);
    }

    // Step 2: Transform (if validator passed)
    if (this.options.itemTransformer) {
      return this.options.itemTransformer(item);
    }

    return item as TItem;
  }
}
