/**
 * Generic single-file importer interface.
 *
 * Unlike GOListImporter (which imports collections with streaming support),
 * this interface represents a one-shot read of a single value from a file.
 *
 * @template TData - The type of data returned after import
 */
export interface GOFileImporter<TData> {
  /**
   * Reads and parses a single value from the configured input path.
   *
   * @returns The parsed data
   */
  import(): Promise<TData>;
}
