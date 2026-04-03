/**
 * JSON List Importer - Generic JSON importer for any list of objects
 */

import * as fs from 'fs';
import { createReadStream } from 'fs';
import * as readline from 'readline';
import type { GOListImporter } from '../GOListImporter.js';
import type { GOListImporterResult } from '../GOListImporterResult.js';
import type { GOListImportError } from '../GOListImporterResult.js';
import type { GOJSONListImporterOptions } from './GOJSONListImporterOptions.js';
import { GOEventEmitterBase } from '../../events/GOEventEmitterBase.js';
import type { GOListImporterEventMap } from '../GOListImporterEvents.js';
import { getErrorMessage, toError } from '../../errors/GOErrorUtils.js';
import { navigateFieldPath } from '../../json/fieldPath.js';
import { GOJSONFormatDetector } from '../../json/GOJSONFormatDetector.js';

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
   *
   * For standard JSON: loads all data and yields items one by one (JSON does not support true streaming).
   * For JSONL mode: uses true line-by-line streaming via readline.createInterface.
   */
  async *importStream(source: string): AsyncGenerator<TItem, void, unknown> {
    if (typeof source !== 'string') {
      throw new Error('Streaming mode only supports file paths, not buffers');
    }

    // Resolve JSONL mode (handles 'auto' detection)
    const isJsonl = await this.resolveJsonlMode(source);

    // Delegate to true streaming for JSONL mode
    if (isJsonl) {
      yield* this.importStreamJsonl(source);
      return;
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
   * True streaming import for NDJSON/JSONL files
   * Uses readline.createInterface for memory-efficient line-by-line processing
   *
   * @param source - File path to a JSONL file
   * @returns AsyncGenerator yielding parsed and transformed items
   */
  private async *importStreamJsonl(source: string): AsyncGenerator<TItem, void, unknown> {
    const skipInvalidItems = this.options.skipInvalidItems ?? false;

    let processedItems = 0;
    let validItems = 0;
    let invalidItems = 0;

    this.emit('import:started', { source, mode: 'stream' });

    try {
      const fileStream = createReadStream(source, { encoding: this.options.encoding ?? 'utf8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      for await (const rawLine of rl) {
        const line = rawLine.trim();
        if (line.length === 0) {
          continue;
        }

        processedItems++;

        try {
          const parsed: unknown = JSON.parse(line);
          const item = this.transformItem(parsed);
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
            itemData: rawLine,
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
          percentage: undefined,
        });
      }

      // Emit final progress
      this.emit('import:progress', {
        processedItems,
        invalidItems,
        totalItems: validItems,
        percentage: 100,
      });

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
   * Supports both standard JSON arrays and NDJSON/JSONL format
   */
  private async parseJSON(source: string | Buffer): Promise<unknown[]> {
    // Read content
    const content =
      typeof source === 'string'
        ? await fs.promises.readFile(source, { encoding: this.options.encoding ?? 'utf8' })
        : source.toString(this.options.encoding ?? 'utf8');

    // Resolve JSONL mode (handles 'auto' detection for batch mode)
    const isJsonl = typeof source === 'string' ? await this.resolveJsonlMode(source) : this.options.jsonl === true;

    // Branch on JSONL mode
    if (isJsonl) {
      return this.parseJsonlContent(content);
    }

    // Parse JSON
    let data: unknown = JSON.parse(content);

    // Extract array from nested structure if jsonPath is provided
    if (this.options.jsonPath) {
      data = navigateFieldPath(data, this.options.jsonPath);
      if (data === undefined) {
        throw new Error(`Path "${this.options.jsonPath}" not found in JSON data`);
      }
    }

    // Ensure data is an array (or wrap single object if enabled)
    if (!Array.isArray(data)) {
      const wrapSingleObject = this.options.wrapSingleObject ?? true;
      if (wrapSingleObject && typeof data === 'object' && data !== null) {
        return [data];
      }
      throw new Error('JSON content must be an array or contain an array at the specified path');
    }

    return data as unknown[];
  }

  /**
   * Parse NDJSON/JSONL content (one JSON object per line)
   * Skips empty lines. Each non-empty line is parsed as independent JSON.
   *
   * @param content - Raw file content with newline-separated JSON objects
   * @returns Array of parsed objects
   */
  private parseJsonlContent(content: string): unknown[] {
    const lines = content.split('\n');
    const items: unknown[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.length === 0) {
        continue;
      }
      items.push(JSON.parse(line));
    }

    return items;
  }

  /**
   * Resolves the effective JSONL mode.
   * For boolean values, returns directly. For 'auto', runs GOJSONFormatDetector.
   *
   * @param source - File path to detect format from
   * @returns true if JSONL mode should be used
   */
  private async resolveJsonlMode(source: string): Promise<boolean> {
    const jsonlOption = this.options.jsonl;

    if (jsonlOption === 'auto') {
      const detector = new GOJSONFormatDetector(this.options.formatDetection);
      const result = await detector.detect(source);
      return result.format === 'jsonl';
    }

    return jsonlOption === true;
  }

  /**
   * Validate and transform raw item to typed item
   */
  private transformItem(item: unknown): TItem {
    // Step 1: Validate (throws error if invalid)
    if (this.options.rowValidator) {
      this.options.rowValidator(item);
    }

    // Step 2: Transform (if validator passed)
    if (this.options.rowTransformer) {
      return this.options.rowTransformer(item);
    }

    return item as TItem;
  }
}
