/**
 * HTML List Exporter Options
 */

/**
 * Options for HTML list exporter
 * @template TItem - The type of items to export
 */
export interface GOHTMLListExporterOptions<TItem = Record<string, unknown>> {
  /** Output file path */
  outputPath: string;

  /** HTML template string with placeholders {{items}} and optional {{count}} */
  template?: string;

  /** Row template for each item with placeholders {{key}} for each property */
  rowTemplate?: string;

  /** Row transformation function (applied before HTML generation) */
  rowTransformer?: (item: TItem) => TItem;

  /** Skip invalid items and continue export (default: false) */
  skipInvalidItems?: boolean;

  /** Encoding for output file (default: 'utf8') */
  encoding?: BufferEncoding;

  /** Allow raw HTML in specific columns (default: false for all columns) */
  allowRawHtml?: boolean | string[];
}
