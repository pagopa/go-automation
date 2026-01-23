/**
 * JSON List Importer Options
 */

/**
 * Options for JSON list importer
 */
export interface GOJSONListImporterOptions {
  /** Skip invalid items and continue import (default: false) */
  skipInvalidItems?: boolean;

  /** Encoding for input file (default: 'utf8') */
  encoding?: BufferEncoding;

  /** Item validation function (applied before transformation, throws error if invalid) */
  itemValidator?: (item: any) => void;

  /** Item transformation function (applied after validation) */
  itemTransformer?: (item: any) => any;

  /** JSON path to extract array from nested structure (e.g., 'data.items') */
  jsonPath?: string;
}
