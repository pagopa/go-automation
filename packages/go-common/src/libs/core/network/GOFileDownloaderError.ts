/**
 * Error thrown by GOFileDownloader for non-2xx responses or unrecoverable failures.
 */
export class GOFileDownloaderError extends Error {
  public readonly statusCode: number | undefined;
  public readonly url: string;
  public readonly attempts: number;

  constructor(message: string, url: string, attempts: number, statusCode?: number) {
    super(message);
    this.name = 'GOFileDownloaderError';
    this.url = url;
    this.attempts = attempts;
    this.statusCode = statusCode;
  }
}
