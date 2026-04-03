/**
 * JSON List Importer Options
 */

import type { GOJSONFormatDetectorOptions } from '../../json/GOJSONFormatDetectorOptions.js';

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
   * JSON format mode:
   * - `false`: Standard JSON (default)
   * - `true`: NDJSON/JSONL (one JSON object per line)
   * - `'auto'`: Auto-detect format using GOJSONFormatDetector
   *
   * When true or auto-detected as JSONL, the source is treated as one JSON object
   * per line. Each non-empty line is parsed independently.
   * The `jsonPath` option is ignored in JSONL mode.
   *
   * @default false
   *
   * @example
   * ```typescript
   * // Explicit JSONL mode
   * const importer = new GOJSONListImporter({ jsonl: true });
   *
   * // Auto-detect format
   * const importer = new GOJSONListImporter({ jsonl: 'auto' });
   * ```
   */
  jsonl?: boolean | 'auto';

  /**
   * Options for format auto-detection. Only used when `jsonl` is set to `'auto'`.
   *
   * @example
   * ```typescript
   * const importer = new GOJSONListImporter({
   *   jsonl: 'auto',
   *   formatDetection: { depth: 'deep', sampleLines: 20 },
   * });
   * ```
   */
  formatDetection?: GOJSONFormatDetectorOptions;
}
