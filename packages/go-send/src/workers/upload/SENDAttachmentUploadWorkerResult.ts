/**
 * Worker result
 */

import type { SENDAttachmentUploadedFile } from './SENDAttachmentUploadedFile.js';
import type { SENDAttachmentUploadWorkerError } from './SENDAttachmentUploadWorkerError.js';

export interface SENDAttachmentUploadWorkerResult {
  /** Successfully uploaded files, in input order */
  uploads: SENDAttachmentUploadedFile[];

  /** Statistics */
  stats: {
    /** Rows consumed from the input file (valid and invalid) */
    totalRows: number;
    /** Files successfully uploaded to SafeStorage */
    uploadedFiles: number;
    /** Rows that failed */
    failedRows: number;
    /** Total processing time in milliseconds */
    processingTime: number;
  };

  /** True when processing stopped at the first failure (skipOnError=false) */
  stoppedOnError: boolean;

  /** Errors encountered while processing */
  errors?: SENDAttachmentUploadWorkerError[] | undefined;
}
