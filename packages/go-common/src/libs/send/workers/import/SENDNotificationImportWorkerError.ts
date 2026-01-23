/**
 * Worker error information
 */

export interface SENDNotificationImportWorkerError {
  /** Row number */
  rowIndex: number;
  /** Row data */
  rowData: Record<string, any>;
  /** Error message */
  message: string;
  /** Error type */
  type: 'import' | 'upload' | 'build' | 'send';
  /** Additional error details */
  details?: any;
}
