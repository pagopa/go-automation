/**
 * Result of a single attachment download attempt
 */
export interface DownloadResult {
  /** Original Safe Storage URI */
  readonly uri: string;

  /** File key (URI without safestorage:// prefix) */
  readonly key: string;

  /** Absolute path where the file was saved (only when successful) */
  readonly outputPath?: string;

  /** Whether the download succeeded */
  readonly success: boolean;

  /** Error message if the download failed */
  readonly error?: string;

  /** Document type (from JSONL input, undefined for plain URI list) */
  readonly documentType?: string;

  /** SHA-256 digest from source metadata (from JSONL input) */
  readonly sha256?: string;

  /** keyValue of the parent record (from JSONL input) */
  readonly keyValue?: string;
}
