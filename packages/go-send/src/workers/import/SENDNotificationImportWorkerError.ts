/**
 * Worker error information
 */

export type SENDNotificationImportWorkerErrorType = 'import' | 'upload' | 'build' | 'send' | 'export';

export interface SENDNotificationImportWorkerError {
  /** Row number */
  rowIndex: number;
  /** Row data */
  rowData: unknown;
  /** Error message */
  message: string;
  /** Error type */
  type: SENDNotificationImportWorkerErrorType;
  /** Additional error details */
  details?: unknown;
}
