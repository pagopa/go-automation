/**
 * File List Importer Options
 * Configuration for plain text line-by-line import
 */

/**
 * Options for file list importer
 *
 * @template TInput - The input type (defaults to string, one line)
 * @template TOutput - The output type after transformation (defaults to TInput)
 */
export interface GOFileListImporterOptions<TInput = string, TOutput = TInput> {
  /** File encoding (default: 'utf8') */
  encoding?: BufferEncoding;

  /**
   * Trim whitespace from each line
   * @default true
   */
  trim?: boolean;

  /**
   * Skip empty lines (after trimming if trim is enabled)
   * @default true
   */
  skipEmptyLines?: boolean;

  /**
   * Lines starting with this prefix are treated as comments and skipped
   * Applied after trimming (if trim is enabled)
   *
   * @example
   * // Skip lines starting with '#'
   * commentPrefix: '#'
   */
  commentPrefix?: string;

  /**
   * Remove duplicate lines from import results
   * Uses a Set internally for O(N) deduplication
   * Applied after trim, skipEmptyLines, and commentPrefix filtering
   * @default false
   */
  deduplicate?: boolean;

  /**
   * Custom line separator for splitting content in batch mode
   * In streaming mode (importStream), readline uses standard line endings (\n, \r\n, \r)
   * @default '\n'
   */
  lineSeparator?: string;

  /** Skip invalid items and continue import (default: false) */
  skipInvalidItems?: boolean;

  /**
   * Row validation function (applied before transformation, throws error if invalid)
   * Receives the raw line string (after trim/filter pipeline)
   */
  rowValidator?: (item: TInput) => void;

  /**
   * Row transformation function (applied after validation)
   * Converts the raw line string into the desired output type
   */
  rowTransformer?: (item: TInput) => TOutput;
}
