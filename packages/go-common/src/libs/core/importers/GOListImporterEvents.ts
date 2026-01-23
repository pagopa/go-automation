/**
 * Generic List Importer Events
 */

/**
 * Event emitted when import starts
 */
export interface GOListImportStartedEvent {
  /** Source file or buffer being imported */
  source: string | 'buffer';
  /** Import mode: batch or stream */
  mode: 'batch' | 'stream';
}

/**
 * Event emitted to report import progress
 */
export interface GOListImportProgressEvent {
  /** Total number of items processed so far */
  processedItems: number;
  /** Number of invalid items encountered */
  invalidItems: number;
  /** Total items (if known, undefined for streams) */
  totalItems?: number | undefined;
  /** Percentage of completion (0-100), if calculable */
  percentage?: number | undefined;
}

/**
 * Event emitted when a valid item is imported
 */
export interface GOListItemImportedEvent<TItem = any> {
  /** The imported item data */
  item: TItem;
  /** Index of this item in the import (0-based) */
  index: number;
}

/**
 * Event emitted when an error occurs during import
 */
export interface GOListImportErrorEvent {
  /** Item number where error occurred */
  itemIndex: number;
  /** The raw data that failed to import */
  itemData: any;
  /** Error message */
  message: string;
  /** Error object */
  error: Error;
}

/**
 * Event emitted when import completes successfully
 */
export interface GOListImportCompletedEvent {
  /** Total number of items successfully imported */
  totalItems: number;
  /** Number of invalid items */
  invalidItems: number;
  /** Time taken in milliseconds */
  duration: number;
}

/**
 * Map of all importer events
 * Used for type-safe event emission and listening
 */
export interface GOListImporterEventMap<TItem = any> {
  /** Emitted when import starts */
  'import:started': GOListImportStartedEvent;

  /** Emitted to report progress */
  'import:progress': GOListImportProgressEvent;

  /** Emitted when a valid item is imported */
  'import:item': GOListItemImportedEvent<TItem>;

  /** Emitted when an error occurs */
  'import:error': GOListImportErrorEvent;

  /** Emitted when import completes */
  'import:completed': GOListImportCompletedEvent;
}
