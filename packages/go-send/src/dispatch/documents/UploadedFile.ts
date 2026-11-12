/**
 * A file uploaded to SafeStorage by the run (deduplicated by SHA-256).
 */
export interface UploadedFile {
  readonly key: string;
  readonly versionToken: string;
  readonly sha256: string;
  readonly contentType: string;
}
