/**
 * Worker error information
 */

/** Processing phase where an upload error occurred */
export type SENDAttachmentUploadWorkerErrorPhase = 'import' | 'read' | 'upload' | 'export';

export interface SENDAttachmentUploadWorkerError {
  /** Zero-based index of the source row in the input file */
  rowIndex: number;
  /** Row data (typed row, raw record for import errors, export record for export errors) */
  rowData: unknown;
  /** Error message */
  message: string;
  /** Processing phase where the error occurred */
  phase: SENDAttachmentUploadWorkerErrorPhase;
}
