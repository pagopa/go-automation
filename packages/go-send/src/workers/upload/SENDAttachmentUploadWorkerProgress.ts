/**
 * Worker progress information
 */

/**
 * Progress counters emitted while the upload worker processes rows.
 *
 * Totals are not included because the worker consumes the input in
 * streaming mode and does not know the row count in advance.
 */
export interface SENDAttachmentUploadWorkerProgress {
  /** Rows fully handled so far (uploaded or failed) */
  processedRows: number;
  /** Files successfully uploaded to SafeStorage */
  uploadedFiles: number;
  /** Rows that failed (import, read or upload errors) */
  failedRows: number;
}
