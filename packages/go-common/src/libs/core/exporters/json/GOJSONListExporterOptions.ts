/**
 * JSON List Exporter Options
 */

/**
 * Options for JSON list exporter
 */
export interface GOJSONListExporterOptions {
  /** Output file path */
  outputPath: string;

  /** Pretty print with indentation (default: false) */
  pretty?: boolean;

  /** Indentation spaces (default: 2) */
  indent?: number;

  /**
   * Use JSONL format (JSON Lines / newline-delimited JSON)
   * Each item is a single JSON object on its own line
   * When true, 'pretty' option is ignored
   * (default: false)
   */
  jsonl?: boolean;

  /** Row transformation function (applied before JSON conversion) */
  rowTransformer?: (item: any) => any;

  /** Skip invalid items and continue export (default: false) */
  skipInvalidItems?: boolean;

  /** Encoding for output file (default: 'utf8') */
  encoding?: BufferEncoding;
}
