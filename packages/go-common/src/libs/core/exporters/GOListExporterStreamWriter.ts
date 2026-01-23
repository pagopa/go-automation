/**
 * Stream writer for list exporters
 */

/**
 * Stream writer for appending items to an export stream
 *
 * Used for incremental/streaming export of large datasets
 * without loading all items in memory at once.
 *
 * @template TItem - The type of items to export
 *
 * @example
 * ```typescript
 * const exporter = new GOCSVListExporter({ outputPath: 'output.csv' });
 * const writer = await exporter.exportStream();
 *
 * for (const item of largeDataset) {
 *   await writer.append(item);
 * }
 *
 * await writer.close();
 * ```
 */
export interface GOListExporterStreamWriter<TItem> {
  /**
   * Append a single item to the export stream
   *
   * The item is immediately written to the output destination,
   * without accumulating in memory.
   *
   * @param item - The item to append to the export
   * @returns Promise that resolves when the item is written
   */
  append(item: TItem): Promise<void>;

  /**
   * Finalize and close the stream
   *
   * This method must be called to ensure:
   * - All buffered data is flushed to disk
   * - File handles are properly closed
   * - Final formatting is applied (e.g., closing brackets in JSON)
   *
   * @returns Promise that resolves when the stream is closed
   */
  close(): Promise<void>;
}
