/**
 * Worker options
 */

import type { ColumnConflictStrategy } from '../../../core/exporters/csv/GOCSVListExporterOptions.js';
import type { GOListExporter } from '../../../core/exporters/GOListExporter.js';

export interface SENDNotificationImportWorkerOptions {
  /** Number of concurrent notification blocks to process in parallel (default: 1) */
  concurrency?: number;

  /** Skip failed notifications (upload/build/send errors) (default: false) */
  skipFailedNotifications?: boolean;

  /** Whether to send notifications immediately (default: false) */
  sendNotifications?: boolean;

  /** Whether to poll for IUN after sending notification (default: false) */
  pollForIun?: boolean;

  /** Maximum polling attempts for IUN (default: 8) */
  pollMaxAttempts?: number;

  /** Delay between polling attempts in ms (default: 30000) */
  pollDelayMs?: number;

  /** Use streaming mode (default: 'auto') */
  useStreaming?: boolean | 'auto';

  /** Streaming threshold in MB (default: 10) */
  streamingThresholdMB?: number;

  /** Optional exporter to save processed notifications with IUN (configured with options in constructor) */
  exporter?: GOListExporter<unknown> | undefined;

  /**
   * Preserve all original CSV columns in the export output.
   * When enabled, the output CSV will contain:
   * 1. All original columns from the input CSV (in their original order)
   * 2. Generated columns (iun, notificationRequestId, status, etc.)
   *
   * This is useful for CSV passthrough scenarios where you want to keep
   * all original data alongside the processing results.
   *
   * Requires:
   * - GOCSVListImporter configured with `preserveOriginalData: true`
   * - GOCSVListExporter configured with `mergeOriginalColumns: true`
   *
   * @default false
   */
  preserveAllColumns?: boolean;

  /**
   * Strategy for handling column name conflicts when preserveAllColumns is enabled.
   * Only applies when `preserveAllColumns` is true.
   *
   * - 'keep-generated': Generated values override original values (default)
   * - 'keep-original': Original values override generated values
   * - 'prefix-generated': Prefix conflicting generated columns with '_gen_'
   * - 'prefix-original': Prefix conflicting original columns with '_orig_'
   *
   * @default 'keep-generated'
   */
  columnConflictStrategy?: ColumnConflictStrategy;

  /**
   * Include processing status information in the export.
   * Adds _status, _processedAt, and _errorMessage columns.
   *
   * @default false
   */
  includeStatusColumns?: boolean;

  /**
   * Export all rows, including those that failed processing.
   * When false, only successfully processed rows (with IUN) are exported.
   *
   * @default false
   */
  exportAllRows?: boolean;
}
