/**
 * CSV List Importer Options
 */

/**
 * Options for CSV list importer
 */
export interface GOCSVListImporterOptions {
  /** CSV delimiter (default: ',') */
  delimiter?: string;

  /** Skip first row if it contains headers (default: true) */
  hasHeaders?: boolean;

  /** Custom column names (if not provided, uses first row or generates col0, col1, etc.) */
  columns?: string[];

  /** Alias for skipInvalidRows */
  skipInvalidItems?: boolean;

  /** Encoding for input file (default: 'utf8') */
  encoding?: BufferEncoding;

  /** Batch size for streaming mode (default: 100) */
  batchSize?: number;

  /**
   * Number of lines to skip before reading the header
   * Useful for CSV files with multi-line headers or metadata rows
   * @default 0
   * @example
   * // Skip 2 lines before the header row
   * skipHeaderRows: 2
   */
  skipHeaderRows?: number;

  /**
   * Map source column names to target column names
   * Applied after parsing, before defaultValues, rowValidator and rowTransformer
   * @example
   * // Rename columns from source format to target format
   * columnMapping: {
   *   'Tax ID': 'senderTaxId',
   *   'CAP': 'physicalZip',
   *   'Città': 'physicalMunicipality'
   * }
   */
  columnMapping?: Record<string, string> | undefined;

  /**
   * Default values for missing or empty columns
   * Applied after columnMapping, before rowValidator and rowTransformer
   * Only applied if the column value is undefined, null, or empty string
   * @example
   * // Set default values for missing columns
   * defaultValues: {
   *   recipientType: 'PF',
   *   digitalType: 'PEC'
   * }
   */
  defaultValues?: Record<string, any> | undefined;

  /** Row validation function (applied after columnMapping and defaultValues, before transformation) */
  rowValidator?: (item: Record<string, any>) => void;

  /** Row transformation function (applied after validation) */
  rowTransformer?: ((item: Record<string, any>) => any) | undefined;

  /**
   * Preserve original CSV row data in a special `_originalRow` property
   * This allows downstream processors to access all original columns,
   * including those not mapped by columnMapping or transformed by rowTransformer.
   *
   * When enabled, the output item will have an additional property:
   * ```typescript
   * _originalRow: Record<string, string>
   * ```
   *
   * This is useful for CSV passthrough scenarios where you want to:
   * - Keep all original columns in the output
   * - Add new computed columns while preserving the original data
   * - Debug column mapping issues
   *
   * @default false
   * @example
   * // Input CSV: id,name,extra_field
   * // With preserveOriginalData: true, output will include:
   * // { id: '1', name: 'John', _originalRow: { id: '1', name: 'John', extra_field: 'value' } }
   */
  preserveOriginalData?: boolean;
}
