/**
 * CSV List Exporter Options
 */

/**
 * Strategy for handling column name conflicts when merging original data
 */
export type ColumnConflictStrategy =
  | 'keep-generated' // Generated values override original (default)
  | 'keep-original' // Original values override generated
  | 'prefix-generated' // Prefix generated columns that conflict (e.g., '_gen_iun')
  | 'prefix-original'; // Prefix original columns that conflict (e.g., '_orig_iun')

export type GOCSVColumnMapper = (columnName: string) => string;

export type GOCSVRowTransformer<TItem> = (item: TItem) => TItem;

/**
 * Options for CSV list exporter
 * @template TItem - The type of items to export
 */
export interface GOCSVListExporterOptions<TItem = Record<string, unknown>> {
  /** Output file path */
  readonly outputPath: string;

  /** CSV delimiter (default: ',') */
  readonly delimiter?: string;

  /** Include header row with column names (default: true) */
  readonly includeHeader?: boolean;

  /** Custom column names (if not provided, uses object keys) */
  readonly columns?: string[];

  /** Custom column mapping function */
  readonly columnMapper?: GOCSVColumnMapper;

  /** Row transformation function (applied before CSV conversion) */
  readonly rowTransformer?: GOCSVRowTransformer<TItem>;

  /** Skip invalid items and continue export (default: false) */
  readonly skipInvalidItems?: boolean;

  /** Encoding for output file (default: 'utf8') */
  readonly encoding?: BufferEncoding;

  /**
   * Merge original row data from `_originalRow` property into the output.
   * This enables CSV passthrough functionality where all original columns
   * are preserved in the output alongside generated columns.
   *
   * When enabled:
   * - Original columns appear first (in their original order)
   * - Generated/processed columns appear after original columns
   * - Column conflicts are handled according to `columnConflictStrategy`
   *
   * Requires items to have `_originalRow: Record<string, string>` property
   * (set by GOCSVListImporter with `preserveOriginalData: true`)
   *
   * @default false
   * @example
   * // Input: { iun: 'ABC123', _originalRow: { id: '1', name: 'John', note: 'test' } }
   * // Output columns: id, name, note, iun
   */
  readonly mergeOriginalColumns?: boolean;

  /**
   * Strategy for handling column name conflicts when merging original data.
   * Only applies when `mergeOriginalColumns` is true.
   *
   * - 'keep-generated': Generated values override original values (default)
   * - 'keep-original': Original values override generated values
   * - 'prefix-generated': Prefix conflicting generated columns with '_gen_'
   * - 'prefix-original': Prefix conflicting original columns with '_orig_'
   *
   * @default 'keep-generated'
   */
  readonly columnConflictStrategy?: ColumnConflictStrategy;

  /**
   * Columns to exclude from the original data when merging.
   * Useful to avoid duplicating columns that are already in the generated data
   * or to remove unwanted columns from the output.
   *
   * Only applies when `mergeOriginalColumns` is true.
   *
   * @example
   * // Exclude internal columns from output
   * excludeOriginalColumns: ['_internal_id', 'temp_field']
   */
  readonly excludeOriginalColumns?: string[];

  /**
   * Explicit column order for the output CSV.
   * If provided, columns will be ordered according to this array.
   * Columns not in this array will be appended at the end in their natural order.
   *
   * This takes precedence over the default ordering (original columns first).
   *
   * @example
   * // Force specific column order
   * columnOrder: ['iun', 'status', 'subject', 'recipientTaxId']
   */
  readonly columnOrder?: string[];
}
