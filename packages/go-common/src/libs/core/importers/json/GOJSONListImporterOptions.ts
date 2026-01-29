/**
 * JSON List Importer Options
 */

/**
 * Options for JSON list importer
 *
 * @template TInput - The input type from JSON (defaults to unknown)
 * @template TOutput - The output type after transformation (defaults to TInput)
 */
export interface GOJSONListImporterOptions<TInput = unknown, TOutput = TInput> {
  /** Skip invalid items and continue import (default: false) */
  skipInvalidItems?: boolean;

  /** Encoding for input file (default: 'utf8') */
  encoding?: BufferEncoding;

  /** Row validation function (applied before transformation, throws error if invalid) */
  rowValidator?: (item: TInput) => void;

  /** Row transformation function (applied after validation) */
  rowTransformer?: (item: TInput) => TOutput;

  /** JSON path to extract array from nested structure (e.g., 'data.items') */
  jsonPath?: string;
}
