/**
 * Input row for the attachment upload worker
 */

/**
 * A single file to upload to SafeStorage, as described by one row/item of
 * the input file (CSV, JSON or JSONL).
 *
 * Any extra input field is preserved (index signature) and copied to the
 * export record, so the output file always contains all the input data.
 */
export interface SENDAttachmentUploadRow {
  /** Path of the local file to upload (required) */
  readonly filePath: string;

  /** MIME type of the file; when omitted it is inferred from the file extension */
  readonly contentType?: string | undefined;

  /** Original raw record as read from the input file (populated by CSV importers with preserveOriginalData) */
  readonly _originalRow?: Record<string, string> | undefined;

  /** Passthrough input fields (JSON/JSONL inputs can carry arbitrary extra fields) */
  readonly [key: string]: unknown;
}
