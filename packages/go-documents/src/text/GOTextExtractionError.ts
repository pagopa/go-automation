/**
 * Error thrown by GOTextExtractor implementations for parse / IO failures.
 */
export class GOTextExtractionError extends Error {
  public readonly mimeType: string | undefined;
  public readonly filePath: string;

  constructor(message: string, filePath: string, mimeType?: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'GOTextExtractionError';
    this.filePath = filePath;
    this.mimeType = mimeType;
  }
}
