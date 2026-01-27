/**
 * HTTP Client error
 */
export class GOHttpClientError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown,
  ) {
    super(message);
    this.name = 'GOHttpClientError';
  }
}
