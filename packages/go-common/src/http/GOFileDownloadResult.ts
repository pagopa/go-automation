/**
 * Result of a successful file download.
 */
export interface GOFileDownloadResult {
  /** Final URL after redirects. */
  readonly finalUrl: string;
  /** HTTP status code of the final response. */
  readonly statusCode: number;
  /** Bytes written to disk. */
  readonly bytesWritten: number;
  /** SHA-256 hex digest of the downloaded bytes (lowercase). */
  readonly sha256: string;
  /** Wall clock duration in milliseconds. */
  readonly durationMs: number;
  /** Number of attempts made (1 = success on first try). */
  readonly attempts: number;
  /** Content-Type from the response, if provided. */
  readonly contentType: string | undefined;
}
