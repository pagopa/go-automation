/**
 * Generic single-file exporter interface.
 *
 * Unlike GOListExporter (which exports collections with streaming support),
 * this interface represents a one-shot write of a single value to a file.
 *
 * @template TData - The type of data to export
 */
export interface GOFileExporter<TData> {
  /**
   * Writes a single value to the configured output path.
   * Implementations should create parent directories if they do not exist.
   *
   * @param data - The data to write
   */
  export(data: TData): Promise<void>;
}
