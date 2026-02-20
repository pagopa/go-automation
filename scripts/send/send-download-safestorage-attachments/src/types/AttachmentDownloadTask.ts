/**
 * A resolved download task: one attachment to fetch with its output destination
 */
export interface AttachmentDownloadTask {
  /** Safe Storage URI (safestorage://...) */
  readonly uri: string;

  /** File key (URI without safestorage:// prefix) */
  readonly key: string;

  /** Absolute directory where the file will be saved */
  readonly outputDir: string;

  /** Document type description (from JSONL input) */
  readonly documentType?: string;

  /** SHA-256 digest from source metadata (from JSONL input) */
  readonly sha256?: string;

  /** keyValue of the parent JSONL record (from JSONL input) */
  readonly keyValue?: string;
}
