/**
 * HTTP Client error
 */
export class GOHttpClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | undefined = undefined,
    public readonly response: unknown = undefined,
    public readonly attemptsUsed: number = 1,
    public readonly retryAfterMs: number | undefined = undefined,
  ) {
    super(message);
    this.name = 'GOHttpClientError';
  }
}
