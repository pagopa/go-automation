/**
 * Worker error information
 */

export interface SENDNotificationImportWorkerError {
  /** Row number */
  rowIndex: number;
  /** Row data */
  rowData: unknown;
  /** Error message */
  message: string;
  /** Error type */
  type: 'import' | 'upload' | 'build' | 'send' | 'export';
  /** Additional error details */
  details?: unknown;
}
