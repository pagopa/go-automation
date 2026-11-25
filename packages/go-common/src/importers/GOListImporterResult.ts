/**
 * Result of an import operation
 */

/**
 * Error occurred during import
 */
export interface GOListImportError {
  /** Item number where error occurred */
  itemIndex: number;
  /** The raw data that failed to import */
  itemData: unknown;
  /** Error message */
  message: string;
}

/**
 * Statistics about the import operation
 */
export interface GOListImportStats {
  /** Total number of items successfully imported */
  totalItems: number;
  /** Number of invalid items */
  invalidItems: number;
  /** Time taken in milliseconds */
  duration: number;
}

/**
 * Result of an import operation
 */
export interface GOListImporterResult<TItem = unknown> {
  /** Successfully imported items */
  items: TItem[];
  /** Import statistics */
  stats: GOListImportStats;
  /** Errors encountered during import (if any) */
  errors?: GOListImportError[];
  /** Total number of rows (including invalid ones) */
  itemCount?: number;
}
