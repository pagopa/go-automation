/**
 * Generic List Exporter Interface
 *
 * Exports a list of items to a specific format (CSV, JSON, Excel, etc.)
 * Supports both batch and streaming export modes
 */

import type { GOEventEmitter } from '../events/GOEventEmitter.js';

import type { GOListExporterEventMap } from './GOListExporterEvents.js';
import type { GOListExporterStreamWriter } from './GOListExporterStreamWriter.js';

/**
 * Generic list exporter interface
 *
 * @template TItem - The type of items to export
 */
export interface GOListExporter<TItem> extends GOEventEmitter<GOListExporterEventMap> {
  /**
   * Export a list of items (batch mode)
   * Exports all items at once to the destination
   *
   * @param items - Array of items to export
   * @returns Promise that resolves when export is complete
   */
  export(items: ReadonlyArray<TItem>): Promise<void>;

  /**
   * Initialize streaming export mode
   * Returns a stream writer for appending items incrementally
   * Useful for exporting large datasets without loading all in memory
   *
   * The stream is automatically closed when:
   * - You call writer.close() explicitly
   * - The exporter instance is garbage collected
   * - The process exits
   *
   * @returns Promise that resolves to a stream writer
   */
  exportStream(): Promise<GOListExporterStreamWriter<TItem>>;
}
