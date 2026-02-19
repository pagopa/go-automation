/**
 * CSV List Exporter - Generic CSV exporter for any list of objects
 */

import * as fs from 'fs';

import { stringify, Stringifier } from 'csv-stringify';

import { GOEventEmitterBase } from '../../events/GOEventEmitterBase.js';
import { valueToString } from '../../utils/GOValueToString.js';
import type { GOListExporter } from '../GOListExporter.js';
import type { GOListExporterEventMap } from '../GOListExporterEvents.js';
import type { GOListExporterStreamWriter } from '../GOListExporterStreamWriter.js';

import type { GOCSVListExporterOptions, ColumnConflictStrategy } from './GOCSVListExporterOptions.js';
import { toError } from '../../errors/GOErrorUtils.js';

/**
 * Type alias for the row transformer function to help with type inference
 */
export type RowTransformer<TItem> = (item: TItem) => TItem;

/**
 * Type alias for the column mapper function
 */
export type ColumnMapper = (columnName: string) => string;

/**
 * Internal resolved options interface with all defaults applied
 */
export interface ResolvedCSVExporterOptions<TItem> {
  readonly outputPath: string;
  readonly delimiter: string;
  readonly encoding: BufferEncoding;
  readonly includeHeader: boolean;
  readonly skipInvalidItems: boolean;
  readonly mergeOriginalColumns: boolean;
  readonly columnConflictStrategy: ColumnConflictStrategy;
  readonly columns?: string[];
  readonly columnOrder?: string[];
  readonly excludeOriginalColumns?: string[];
  readonly columnMapper?: ColumnMapper;
  readonly rowTransformer?: RowTransformer<TItem>;
}

/**
 * Generic CSV list exporter
 * Exports any array of objects to CSV format
 *
 * @template TItem - The type of items to export
 */
export class GOCSVListExporter<TItem extends Record<string, unknown>>
  extends GOEventEmitterBase<GOListExporterEventMap>
  implements GOListExporter<TItem>
{
  private readonly options: ResolvedCSVExporterOptions<TItem>;
  private writeStream?: fs.WriteStream;
  private stringifier?: Stringifier;
  private isHeaderWritten: boolean = false;
  private exportedCount: number = 0;
  private failedCount: number = 0;
  private startTime: number = 0;
  private totalItems?: number | undefined;

  // Cache for performance optimization
  private cachedColumns?: string[] | undefined;
  private cachedMappedColumns?: string[] | undefined;
  // Set of columns to exclude from original data
  private excludeOriginalColumnsSet?: Set<string> | undefined;

  constructor(options: GOCSVListExporterOptions<TItem>) {
    super();

    this.options = {
      outputPath: options.outputPath,
      delimiter: options.delimiter ?? ',',
      encoding: options.encoding ?? 'utf8',
      includeHeader: options.includeHeader ?? true,
      skipInvalidItems: options.skipInvalidItems ?? false,
      mergeOriginalColumns: options.mergeOriginalColumns ?? false,
      columnConflictStrategy: options.columnConflictStrategy ?? 'keep-generated',
      ...(options.columns !== undefined && { columns: options.columns }),
      ...(options.columnOrder !== undefined && { columnOrder: options.columnOrder }),
      ...(options.excludeOriginalColumns !== undefined && {
        excludeOriginalColumns: options.excludeOriginalColumns,
      }),
      ...(options.columnMapper !== undefined && { columnMapper: options.columnMapper }),
      ...(options.rowTransformer !== undefined && { rowTransformer: options.rowTransformer }),
    };
  }

  /**
   * Export items in batch mode
   * Uses streaming internally for memory efficiency
   */
  async export(items: ReadonlyArray<TItem>): Promise<void> {
    this.startTime = Date.now();
    this.exportedCount = 0;
    this.failedCount = 0;
    this.totalItems = items.length;
    this.isHeaderWritten = false;
    this.cachedColumns = undefined;
    this.cachedMappedColumns = undefined;
    this.excludeOriginalColumnsSet = undefined;

    this.emit('export:started', {
      itemCount: items.length,
      destination: this.options.outputPath,
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
  async exportStream(): Promise<GOListExporterStreamWriter<TItem>> {
    // Reset state
    this.startTime = Date.now();
    this.exportedCount = 0;
    this.failedCount = 0;
    this.isHeaderWritten = false;
    this.totalItems = undefined;
    this.cachedColumns = undefined;
    this.cachedMappedColumns = undefined;
    this.excludeOriginalColumnsSet = undefined;

    // emit export started event
    this.emit('export:started', {
      itemCount: 0,
      destination: this.options.outputPath,
      mode: 'stream',
    });
    return Promise.resolve(this.initializeStream());
  }

  /**
   * Initialize streaming
   */
  private initializeStream(): GOListExporterStreamWriter<TItem> {
    // Create write stream
    this.writeStream = fs.createWriteStream(this.options.outputPath, {
      encoding: this.options.encoding,
    });

    // Create CSV stringifier
    this.stringifier = stringify({ delimiter: this.options.delimiter, header: false });

    // Pipe stringifier to file
    this.stringifier.pipe(this.writeStream);

    // Return stream writer
    return {
      append: async (item: TItem) => {
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
      if (!this.stringifier || !this.writeStream) {
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
        this.stringifier?.removeListener('error', errorHandler);
        this.writeStream?.removeListener('error', errorHandler);
        this.writeStream?.removeListener('finish', finishHandler);
      };

      this.stringifier.on('error', errorHandler);
      this.writeStream.on('error', errorHandler);
      this.writeStream.on('finish', finishHandler);

      // End the stringifier (will trigger writeStream finish event)
      this.stringifier.end();
    });
  }

  /**
   * Append a single item in streaming mode
   */
  private appendItem(item: TItem): void {
    if (!this.stringifier || !this.writeStream) {
      throw new Error('Export stream not initialized. Call exportStream() first.');
    }

    const currentIndex = this.exportedCount + this.failedCount;

    try {
      // Write header if not written yet and includeHeader is true
      if (!this.isHeaderWritten && this.options.includeHeader) {
        const columns = this.getColumnsOnce(item);
        const headerRow = this.getMappedColumnsOnce(columns);
        this.stringifier.write(headerRow);
        this.isHeaderWritten = true;
      }

      // Transform and write item
      const transformedItem = this.transformRow(item);
      const columns = this.getColumnsOnce(item);

      // Merge original row data if mergeOriginalColumns is enabled
      const mergedItem = this.options.mergeOriginalColumns
        ? this.mergeRowData(transformedItem, columns)
        : transformedItem;

      // Filter out skip columns and get values
      const filteredColumns = columns.filter((col) => !col.startsWith('_skip_'));
      const values = filteredColumns.map((col) => valueToString(mergedItem[col]));

      this.stringifier.write(values);

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
   * Get columns once and cache them
   * Handles merging original columns when mergeOriginalColumns is enabled
   */
  private getColumnsOnce(item: TItem): string[] {
    if (!this.cachedColumns) {
      // Initialize exclude set once
      if (!this.excludeOriginalColumnsSet && this.options.excludeOriginalColumns) {
        this.excludeOriginalColumnsSet = new Set(this.options.excludeOriginalColumns);
      }

      if (this.options.columns) {
        // Use explicit columns list
        this.cachedColumns = this.options.columns;
      } else if (this.options.mergeOriginalColumns && '_originalRow' in item && item['_originalRow']) {
        // Merge original columns with generated columns
        this.cachedColumns = this.computeMergedColumns(item);
      } else {
        // Default: use object keys (excluding _originalRow)
        this.cachedColumns = Object.keys(item).filter((key) => key !== '_originalRow');
      }
    }
    return this.cachedColumns;
  }

  /**
   * Compute merged columns from original and generated data
   * Original columns come first, then new generated columns
   */
  private computeMergedColumns(item: TItem): string[] {
    const originalRow = item['_originalRow'] as Record<string, unknown> | undefined;
    if (!originalRow) {
      return Object.keys(item).filter((key) => key !== '_originalRow');
    }

    // Get original column names (in original order)
    const originalColumnNames = Object.keys(originalRow);

    // Get generated column names (excluding _originalRow)
    const generatedColumnNames = Object.keys(item).filter((key) => key !== '_originalRow');

    // Build final column list based on conflict strategy
    const strategy = this.options.columnConflictStrategy;
    const excludeSet = this.excludeOriginalColumnsSet ?? new Set<string>();

    // Track which columns we've added
    const addedColumns = new Set<string>();
    const result: string[] = [];

    // If columnOrder is specified, use it as the base
    if (this.options.columnOrder) {
      for (const col of this.options.columnOrder) {
        if (!addedColumns.has(col) && !excludeSet.has(col)) {
          result.push(col);
          addedColumns.add(col);
        }
      }
    }

    // Add original columns first (respecting exclusions)
    for (const col of originalColumnNames) {
      if (excludeSet.has(col)) continue;

      if (addedColumns.has(col)) continue; // Already added by columnOrder

      const isConflict = generatedColumnNames.includes(col);

      if (isConflict) {
        // Handle conflict based on strategy
        const resolvedCol = this.resolveColumnConflict(col, strategy, 'original');
        if (!addedColumns.has(resolvedCol)) {
          result.push(resolvedCol);
          addedColumns.add(resolvedCol);
        }
      } else {
        result.push(col);
        addedColumns.add(col);
      }
    }

    // Add generated columns (those not already in result)
    for (const col of generatedColumnNames) {
      if (addedColumns.has(col)) continue; // Already added

      const isConflict = originalColumnNames.includes(col) && !excludeSet.has(col);

      if (isConflict) {
        const resolvedCol = this.resolveColumnConflict(col, strategy, 'generated');
        if (!addedColumns.has(resolvedCol)) {
          result.push(resolvedCol);
          addedColumns.add(resolvedCol);
        }
      } else {
        result.push(col);
        addedColumns.add(col);
      }
    }

    return result;
  }

  /**
   * Resolve column name conflict based on strategy
   */
  private resolveColumnConflict(
    columnName: string,
    strategy: ColumnConflictStrategy,
    source: 'original' | 'generated',
  ): string {
    switch (strategy) {
      case 'keep-generated':
        // Original column is skipped (not renamed), generated wins
        return source === 'generated' ? columnName : `_skip_${columnName}`;
      case 'keep-original':
        // Generated column is skipped, original wins
        return source === 'original' ? columnName : `_skip_${columnName}`;
      case 'prefix-generated':
        return source === 'generated' ? `_gen_${columnName}` : columnName;
      case 'prefix-original':
        return source === 'original' ? `_orig_${columnName}` : columnName;
      default:
        return columnName;
    }
  }

  /**
   * Get mapped column names once and cache them
   */
  private getMappedColumnsOnce(columns: string[]): string[] {
    if (!this.cachedMappedColumns) {
      // Filter out skip columns (used for conflict resolution)
      const filteredColumns = columns.filter((col) => !col.startsWith('_skip_'));

      if (this.options.columnMapper) {
        const mapper = this.options.columnMapper;
        this.cachedMappedColumns = filteredColumns.map((col) => mapper(col));
      } else {
        this.cachedMappedColumns = filteredColumns;
      }
    }
    return this.cachedMappedColumns;
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

  /**
   * Merge original row data with transformed item for export
   * This is called when mergeOriginalColumns is enabled
   */
  private mergeRowData(transformedItem: TItem, columns: string[]): Record<string, unknown> {
    const originalRow = transformedItem['_originalRow'] as Record<string, unknown> | undefined;

    if (!this.options.mergeOriginalColumns || !originalRow) {
      return transformedItem;
    }

    const strategy = this.options.columnConflictStrategy;
    const excludeSet = this.excludeOriginalColumnsSet ?? new Set<string>();
    const result: Record<string, unknown> = {};

    // Get original column names for conflict detection
    const originalColumnNames = new Set(Object.keys(originalRow));
    const generatedColumnNames = new Set(Object.keys(transformedItem).filter((k) => k !== '_originalRow'));

    for (const col of columns) {
      // Skip internal columns
      if (col.startsWith('_skip_')) continue;

      // Check if this is a prefixed column
      if (col.startsWith('_orig_')) {
        const originalColName = col.slice(6); // Remove '_orig_' prefix
        result[col] = originalRow[originalColName];
      } else if (col.startsWith('_gen_')) {
        const generatedColName = col.slice(5); // Remove '_gen_' prefix
        result[col] = transformedItem[generatedColName as keyof TItem];
      } else if (excludeSet.has(col)) {
        // Excluded from original, use generated if available
        result[col] = transformedItem[col as keyof TItem];
      } else if (originalColumnNames.has(col) && generatedColumnNames.has(col)) {
        // Conflict: use strategy
        if (strategy === 'keep-generated' || strategy === 'prefix-original') {
          result[col] = transformedItem[col as keyof TItem];
        } else {
          result[col] = originalRow[col];
        }
      } else if (originalColumnNames.has(col)) {
        result[col] = originalRow[col];
      } else {
        result[col] = transformedItem[col as keyof TItem];
      }
    }

    return result;
  }
}
