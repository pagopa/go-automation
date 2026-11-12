/**
 * Generic List Exporter Events
 */

/**
 * Event emitted when export starts
 */
export interface GOListExporterStartedEvent {
  /** Number of items to export */
  itemCount: number;
  /** Destination path or identifier */
  destination: string;
  /** Export mode: batch or stream */
  mode: 'batch' | 'stream';
}

/**
 * Event emitted during export progress
 */
export interface GOListExporterProgressEvent {
  /** Number of items exported so far */
  exportedItems: number;
  /** Total items to export (if known) */
  totalItems?: number | undefined;
  /** Progress percentage (if total is known) */
  percentage?: number | undefined;
}

/**
 * Event emitted when an item is exported
 */
export interface GOListExporterItemExportedEvent<TItem = unknown> {
  /** The exported item */
  item: TItem;
  /** Item index in the export sequence */
  index: number;
}

/**
 * Event emitted when export completes
 */
export interface GOListExporterCompletedEvent {
  /** Total items exported successfully */
  totalItems: number;
  /** Number of items that failed to export */
  failedItems: number;
  /** Destination path or identifier */
  destination: string;
  /** Export duration in milliseconds */
  duration: number;
}

/**
 * Event emitted when an export error occurs
 */
export interface GOListExporterErrorEvent {
  /** Error that occurred */
  error: Error;
  /** Item that caused the error (if applicable) */
  item?: unknown;
  /** Item index (if applicable) */
  index?: number;
}

/**
 * Map of all list exporter events
 */
export interface GOListExporterEventMap {
  /** Emitted when export starts */
  'export:started': GOListExporterStartedEvent;

  /** Emitted during export progress */
  'export:progress': GOListExporterProgressEvent;

  /** Emitted when an item is exported */
  'export:item': GOListExporterItemExportedEvent;

  /** Emitted when export completes */
  'export:completed': GOListExporterCompletedEvent;

  /** Emitted when an error occurs */
  'export:error': GOListExporterErrorEvent;
}
