/**
 * HTTP response from a runbook HTTP step.
 */
export interface RunbookHttpResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

/**
 * HTTP service for runbook steps.
 * Uses the native Node.js fetch API.
 *
 * @example
 * ```typescript
 * const service = new RunbookHttpService();
 * const response = await service.request('GET', 'https://api.example.com/data');
 * ```
 */
export class RunbookHttpService {
  private readonly defaultTimeout: number;

  constructor(defaultTimeout: number = 30000) {
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Executes an HTTP request.
   *
   * @param method - HTTP method
   * @param url - Full URL
   * @param body - Optional request body (will be JSON-serialized if object)
   * @param headers - Optional request headers
   * @param timeout - Optional timeout in milliseconds
   * @returns HTTP response
   */
  async request(
    method: string,
    url: string,
    body?: unknown,
    headers?: Readonly<Record<string, string>>,
    timeout?: number,
  ): Promise<RunbookHttpResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout ?? this.defaultTimeout);

    try {
      const requestInit: RequestInit = {
        method,
        ...(headers !== undefined ? { headers: { ...headers } } : {}),
        signal: controller.signal,
      };

      if (body !== undefined) {
        requestInit.body = typeof body === 'string' ? body : JSON.stringify(body);
        requestInit.headers ??= { 'Content-Type': 'application/json' };
      }

      const response = await fetch(url, requestInit);

      const contentType = response.headers.get('content-type');
      const isJson = contentType?.includes('application/json') === true;
      const responseBody: unknown = isJson ? await response.json() : await response.text();

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
