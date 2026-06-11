/**
 * Uploaded attachment resolved from a send-upload-attachments results file
 */

/**
 * A single attachment already uploaded to SafeStorage, as described by one
 * record of the results file (files-results.json) produced by the
 * send-upload-attachments script.
 *
 * Attachments sharing the same `pratica` belong to the same notification.
 */
export interface SENDUploadedAttachment {
  /** Grouping key linking the attachment to a notification row */
  readonly pratica: string;

  /** Path of the original local file (used to derive the document title) */
  readonly filePath: string;

  /** SafeStorage file key */
  readonly fileKey: string;

  /** SafeStorage version token */
  readonly versionToken: string;

  /** SHA256 digest of the file content (base64) */
  readonly sha256: string;

  /** MIME type used for the upload */
  readonly contentType: string;
}
