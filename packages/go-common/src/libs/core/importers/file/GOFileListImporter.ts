/**
 * File List Importer - Generic plain text line-by-line importer
 * Reads text files and yields lines as items, with configurable filtering and transformation
 */

import * as fs from 'fs';
import { createReadStream } from 'fs';
import * as readline from 'readline';

import type { GOListImporter } from '../GOListImporter.js';
import type { GOListImporterResult } from '../GOListImporterResult.js';
import type { GOListImportError } from '../GOListImporterResult.js';
import type { GOFileListImporterOptions } from './GOFileListImporterOptions.js';
import { GOEventEmitterBase } from '../../events/GOEventEmitterBase.js';
import type { GOListImporterEventMap } from '../GOListImporterEvents.js';
import { getErrorMessage, toError } from '../../errors/GOErrorUtils.js';

/**
 * Generic File List Importer
 * Parses plain text files line by line from files or buffers
 * Supports trim, skip empty lines, comment prefix, deduplication, validation, and transformation
 * Emits events during import for monitoring and logging
 *
 * @template TItem - The type of items to import (defaults to string)
 */
export class GOFileListImporter<TItem = string>
  extends GOEventEmitterBase<GOListImporterEventMap<TItem>>
  implements GOListImporter<TItem>
{
  constructor(private readonly options: GOFileListImporterOptions<string, TItem> = {}) {
    super();
  }

  /**
   * Import lines from a text file or buffer in batch mode
   *
   * Reads the entire content, splits by line separator, and applies the
   * filtering pipeline: trim, skipEmptyLines, commentPrefix, deduplicate,
   * then validate and transform each line.
   *
   * @param source - File path or Buffer containing text content
   * @returns Import result with items and statistics
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
      // Read content
      const content =
        typeof source === 'string'
          ? await fs.promises.readFile(source, { encoding: this.options.encoding ?? 'utf8' })
          : source.toString(this.options.encoding ?? 'utf8');

      // Split into lines
      const lineSeparator = this.options.lineSeparator ?? '\n';
      const rawLines = content.split(lineSeparator);

      // Apply filtering pipeline and collect lines
      const lines = this.filterLines(rawLines);
      const totalItems = lines.length;

      // Process each line
      for (let i = 0; i < totalItems; i++) {
        processedItems++;
        const currentLine = lines[i];

        // Safety check for undefined (noUncheckedIndexedAccess)
        if (currentLine === undefined) {
          continue;
        }

        try {
          const item = this.transformItem(currentLine);
          items.push(item);
          this.emit('import:item', { item, index: i });
        } catch (error: unknown) {
          invalidItems++;
          const errorMessage = getErrorMessage(error);
          const importError: GOListImportError = {
            itemIndex: i + 1,
            itemData: currentLine,
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
   * Import lines in true streaming mode using readline
   *
   * Creates a readable stream from the file and processes lines one by one
   * via readline.createInterface. Applies the same filtering pipeline per line.
   *
   * @param source - File path to read
   * @returns AsyncGenerator yielding items line by line
   */
  async *importStream(source: string): AsyncGenerator<TItem, void, unknown> {
    if (typeof source !== 'string') {
      throw new Error('Streaming mode only supports file paths, not buffers');
    }

    const skipInvalidItems = this.options.skipInvalidItems ?? false;
    const seenLines = this.options.deduplicate ? new Set<string>() : undefined;

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
        // Apply per-line filtering
        const line = this.filterLine(rawLine);
        if (line === undefined) {
          continue;
        }

        // Deduplicate check
        if (seenLines) {
          if (seenLines.has(line)) {
            continue;
          }
          seenLines.add(line);
        }

        processedItems++;

        try {
          const item = this.transformItem(line);
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
   * Apply the filtering pipeline to all raw lines in batch mode
   * Pipeline: trim -> skipEmptyLines -> commentPrefix -> deduplicate
   */
  private filterLines(rawLines: ReadonlyArray<string>): ReadonlyArray<string> {
    const result: string[] = [];
    const seenLines = this.options.deduplicate ? new Set<string>() : undefined;

    for (const rawLine of rawLines) {
      const line = this.filterLine(rawLine);
      if (line === undefined) {
        continue;
      }

      // Deduplicate check
      if (seenLines) {
        if (seenLines.has(line)) {
          continue;
        }
        seenLines.add(line);
      }

      result.push(line);
    }

    return result;
  }

  /**
   * Apply per-line filtering: trim, skipEmptyLines, commentPrefix
   *
   * @param rawLine - The raw line from the file
   * @returns The filtered line, or undefined if the line should be skipped
   */
  private filterLine(rawLine: string): string | undefined {
    const trim = this.options.trim ?? true;
    const skipEmptyLines = this.options.skipEmptyLines ?? true;

    let line = trim ? rawLine.trim() : rawLine;

    // Skip empty lines
    if (skipEmptyLines && line.length === 0) {
      return undefined;
    }

    // Skip comment lines
    if (this.options.commentPrefix && line.startsWith(this.options.commentPrefix)) {
      return undefined;
    }

    return line;
  }

  /**
   * Validate and transform a raw line string to the output type
   */
  private transformItem(line: string): TItem {
    // Step 1: Validate (throws error if invalid)
    if (this.options.rowValidator) {
      this.options.rowValidator(line);
    }

    // Step 2: Transform (if validator passed)
    if (this.options.rowTransformer) {
      return this.options.rowTransformer(line);
    }

    return line as TItem;
  }
}
