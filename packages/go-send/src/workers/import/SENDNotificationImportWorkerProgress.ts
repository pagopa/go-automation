/**
 * Worker progress information
 */

export interface SENDNotificationImportWorkerProgress {
  /** Current phase */
  phase: 'importing' | 'processing';
  /** Total rows */
  totalRows: number;
  /** Processed rows */
  processedRows: number;
  /** Documents uploaded */
  documentsUploaded: number;
  /** Notifications sent */
  notificationsSent: number;
  /** IUNs obtained */
  iunsObtained: number;
  /** Failed rows */
  failedRows: number;
  /** Current batch number */
  currentBatch: number;
  /** Progress percentage (0-100) */
  percentage: number;
}
