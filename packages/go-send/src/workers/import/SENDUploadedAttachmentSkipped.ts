/**
 * Skipped record information from a send-upload-attachments results file
 */

/**
 * A record of the send-upload-attachments results file that cannot be used
 * as a notification attachment (failed upload or malformed record).
 */
export interface SENDUploadedAttachmentSkipped {
  /** Path of the local file, when available */
  readonly filePath: string;

  /** Grouping key of the record, when available */
  readonly pratica: string;

  /** Human-readable reason why the record was skipped */
  readonly reason: string;
}
