/**
 * Upload failure of a document; the rows using it become `SEND_FAILED`.
 */
export class UploadError extends Error {
  constructor(
    /** `UPLOAD_REJECTED` (preload 4xx) or `UPLOAD_FAILED` (PUT or preload failed after retries). */
    public readonly code: 'UPLOAD_REJECTED' | 'UPLOAD_FAILED',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'UploadError';
  }
}
