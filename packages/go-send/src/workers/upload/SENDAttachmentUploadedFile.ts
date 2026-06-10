/**
 * Successful upload information
 */

/**
 * Result of a single successful upload to SafeStorage.
 *
 * Contains only scalar values: the file content buffer returned by the
 * attachment service is intentionally not retained, so processing large
 * batches does not pin every uploaded file in memory.
 */
export interface SENDAttachmentUploadedFile {
  /** Zero-based index of the source row in the input file */
  rowIndex: number;
  /** Path of the uploaded local file */
  filePath: string;
  /** SafeStorage file key */
  fileKey: string;
  /** SafeStorage version token */
  versionToken: string;
  /** SHA256 digest of the file content (base64) */
  sha256: string;
  /** Size of the uploaded file in bytes */
  fileSizeBytes: number;
  /** MIME type used for the upload */
  contentType: string;
  /** Upload completion timestamp (ISO 8601) */
  uploadedAt: string;
}
