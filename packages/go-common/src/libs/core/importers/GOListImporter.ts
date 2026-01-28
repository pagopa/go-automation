/**
 * Generic List Importer Interface
 *
 * Importers are responsible for parsing source files (CSV, JSON, HTML, etc.)
 * and returning imported items. They emit events for monitoring progress.
 */

import type { GOEventEmitter } from '../events/GOEventEmitter.js';
import type { GOListImporterEventMap } from './GOListImporterEvents.js';
import type { GOListImporterResult } from './GOListImporterResult.js';

/**
 * Base interface for generic list importers
 *
 * @template TItem - The type of items to import
 */
export interface GOListImporter<TItem = unknown> extends GOEventEmitter<
  GOListImporterEventMap<TItem>
> {
  /**
   * Import items from source in batch mode
   *
   * This method parses the source file and returns all items at once.
   * Best for small to medium files that fit in memory.
   *
   * @param source - Import source (file path or buffer)
   * @returns Import result with items and statistics
   */
  import(source: string | Buffer): Promise<GOListImporterResult<TItem>>;

  /**
   * Import items in streaming mode (for very large files)
   *
   * Returns an async generator that yields items one by one or in batches.
   * Useful for files that are too large to fit in memory.
   *
   * @param source - Import source (file path)
   * @returns AsyncGenerator yielding items
   */
  importStream(source: string): AsyncGenerator<TItem, void, unknown>;
}
