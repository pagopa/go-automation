/**
 * CSV List Importer - Generic CSV importer for any list of objects
 * Optimized for large files using streaming
 */

import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import type { Options } from 'csv-parse';

/**
 * CSV parse options type alias
 * We use a simplified type because csv-parse's overloaded signatures
 * are incompatible with exactOptionalPropertyTypes: true
 */
type CSVParseOptions = Options;
import type { GOListImporter } from '../GOListImporter.js';
import type { GOListImporterResult } from '../GOListImporterResult.js';
import type { GOListImportError } from '../GOListImporterResult.js';
import type { GOCSVListImporterOptions, CSVRecord } from './GOCSVListImporterOptions.js';
import { GOEventEmitterBase } from '../../events/GOEventEmitterBase.js';
import type { GOListImporterEventMap } from '../GOListImporterEvents.js';
import { getErrorMessage, toError } from '../../errors/GOErrorUtils.js';

/**
 * Generic CSV List Importer
 * Supports streaming for large files (GB+)
 * Emits events during import for monitoring and logging
 *
 * @template TItem - The type of items to import
 */
export class GOCSVListImporter<TItem = CSVRecord>
  extends GOEventEmitterBase<GOListImporterEventMap<TItem>>
  implements GOListImporter<TItem>
{
  // Cached parser options to avoid recalculation
  private parserOptions?: CSVParseOptions;

  constructor(private readonly options: GOCSVListImporterOptions<TItem>) {
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
    const errors: GOListImportError[] = [];
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
      const currentRecord = records[i];

      // Safety check for undefined record (noUncheckedIndexedAccess)
      if (currentRecord === undefined) {
        continue;
      }

      try {
        const item = this.transformItem(currentRecord);
        items.push(item);
        this.emit('import:item', { item, index: i });
      } catch (error: unknown) {
        invalidItems++;

        // Emit error event
        const errorMessage = getErrorMessage(error);
        const importError: GOListImportError = {
          itemIndex: i + 1,
          itemData: currentRecord,
          message: errorMessage,
        };
        const finalError = toError(error);

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
    // Type assertion needed: csv-parse overloads are incompatible with exactOptionalPropertyTypes
    const parser = stream.pipe(
      (parse as (options: CSVParseOptions) => ReturnType<typeof parse>)(this.getParserOptions()),
    );

    for await (const record of parser) {
      processedItems++;

      // Type assertion for csv-parse record which is typed as unknown in stream mode
      const csvRecord = record as CSVRecord;

      try {
        const item = this.transformItem(csvRecord);
        validItems++;
        this.emit('import:item', { item, index: validItems - 1 });

        yield item;
      } catch (error: unknown) {
        invalidItems++;

        // Emit error event
        const errorMessage = getErrorMessage(error);
        this.emit('import:error', {
          itemIndex: processedItems,
          itemData: csvRecord,
          message: errorMessage,
          error: toError(error),
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
  private getParserOptions(): CSVParseOptions {
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
  private async parseCSVBuffer(buffer: Buffer): Promise<CSVRecord[]> {
    return new Promise((resolve, reject) => {
      // Type assertion needed due to csv-parse's complex overloaded types
      // When columns: true, records will be CSVRecord[], otherwise string[][]
      const callback = (error: Error | undefined, records: CSVRecord[] | undefined): void => {
        if (error) {
          reject(error);
        } else {
          resolve(records ?? []);
        }
      };

      // Type assertion needed: csv-parse overloads are incompatible with exactOptionalPropertyTypes
      // This is safe because we always set columns: true or provide column names
      type CSVParseHandler = (error: Error | undefined, records: CSVRecord[] | undefined) => void;
      (parse as (input: Buffer, options: CSVParseOptions, callback: CSVParseHandler) => void)(
        buffer,
        this.getParserOptions(),
        callback,
      );
    });
  }

  /**
   * Validate and transform raw CSV record to typed item
   */
  private transformItem(record: CSVRecord): TItem {
    // Preserve original record before any transformation if enabled
    const originalRow: CSVRecord | undefined = this.options.preserveOriginalData ? { ...record } : undefined;

    let item: CSVRecord = { ...record };

    // Step 1: Apply column mapping (rename columns)
    if (this.options.columnMapping) {
      const mapped: CSVRecord = {};

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
        const currentValue = item[key];
        if (currentValue === undefined || currentValue === null || currentValue === '') {
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
      const transformed = this.options.rowTransformer(item);
      // Step 5: Attach original row data if preserveOriginalData is enabled
      if (originalRow) {
        (transformed as CSVRecord & { _originalRow?: CSVRecord })._originalRow = originalRow;
      }
      return transformed;
    }

    // Step 5: Attach original row data if preserveOriginalData is enabled (no transformer case)
    if (originalRow) {
      (item as CSVRecord & { _originalRow?: CSVRecord })._originalRow = originalRow;
    }

    return item as TItem;
  }
}
