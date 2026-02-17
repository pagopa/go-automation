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

  /**
   * Enable NDJSON/JSONL mode (newline-delimited JSON)
   *
   * When true, the source is treated as one JSON object per line instead of
   * a single JSON array. Each non-empty line is parsed independently.
   * The `jsonPath` option is ignored in JSONL mode.
   *
   * @default false
   *
   * @example
   * ```typescript
   * // Import a .jsonl file
   * const importer = new GOJSONListImporter({ jsonl: true });
   * const result = await importer.import('data.jsonl');
   * ```
   */
  jsonl?: boolean;
}
