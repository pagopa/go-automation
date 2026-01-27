/**
 * HTTP Client for PN API requests (Optimized) - Node.js built-in fetch with Undici
 *
 * This client provides a type-safe HTTP client with optional proxy support
 * for debugging purposes (e.g., Proxyman, Charles Proxy).
 *
 * @example
 * ```typescript
 * // Basic usage without proxy
 * const client = new GOHttpClient({
 *   baseUrl: 'https://api.example.com',
 *   timeout: 30000,
 * });
 *
 * // With proxy for debugging
 * const debugClient = new GOHttpClient({
 *   baseUrl: 'https://api.example.com',
 *   proxyUrl: 'http://127.0.0.1:9090',
 *   debug: true,
 * });
 * ```
 */

import { ProxyAgent } from 'undici';
import type { Dispatcher } from 'undici';

import { GOEventEmitterBase } from '../events/GOEventEmitterBase.js';

import type { GOAbortableRequest } from './GOAbortableRequest.js';
import type { GOHttpClientConfig } from './GOHttpClientConfig.js';
import { GOHttpClientError } from './GOHttpClientError.js';
import type { GOHttpClientEventMap } from './GOHttpClientEvents.js';

/** HTTP method type for type-safe method handling */
type HttpMethod = 'GET' | 'POST' | 'PUT';

/**
 * Type for the request body that can be sent via fetch.
 * Includes standard BodyInit types plus Buffer for Node.js compatibility.
 */
type RequestBody = string | Uint8Array | ArrayBuffer | Blob | FormData | URLSearchParams;

/**
 * Base HTTP client with event emission and optional proxy support.
 *
 * Features:
 * - Type-safe request/response handling
 * - Event emission for request lifecycle
 * - Configurable timeout with AbortController
 * - Optional proxy support for debugging
 * - Automatic JSON serialization/deserialization
 *
 * @example
 * ```typescript
 * const client = new GOHttpClient({
 *   baseUrl: 'https://api.example.com',
 *   defaultHeaders: { 'Authorization': 'Bearer token' },
 *   timeout: 30000,
 *   proxyUrl: process.env.DEBUG_PROXY_URL, // Optional
 * });
 *
 * // Simple GET request
 * const data = await client.get<UserResponse>('/users/123');
 *
 * // POST with body
 * const created = await client.post<User>('/users', { name: 'John' });
 *
 * // Abortable request
 * const request = client.getAbortable<Data>('/slow-endpoint');
 * setTimeout(() => request.abort(), 5000);
 * const result = await request.promise;
 * ```
 */
export class GOHttpClient extends GOEventEmitterBase<GOHttpClientEventMap> {
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeout: number;
  private readonly debug: boolean;
  private readonly proxyAgent: Dispatcher | undefined;

  constructor(config: GOHttpClientConfig) {
    super();
    this.baseUrl = config.baseUrl;
    this.defaultHeaders = config.defaultHeaders ?? {};
    this.timeout = config.timeout ?? 30000;
    this.debug = config.debug ?? false;

    // Initialize proxy agent only if proxyUrl is provided
    if (config.proxyUrl !== undefined && config.proxyUrl.length > 0) {
      this.proxyAgent = new ProxyAgent(config.proxyUrl);
      if (this.debug) {
        this.logDebug(`Proxy enabled: ${config.proxyUrl}`);
      }
    }
  }

  /**
   * Logs debug messages when debug mode is enabled.
   * Uses structured format for consistent output.
   */
  private logDebug(message: string, data?: unknown): void {
    if (!this.debug) {
      return;
    }

    if (data !== undefined) {
      // Using process.stdout for non-blocking output
      process.stdout.write(`[HTTP] ${message}: ${JSON.stringify(data, null, 2)}\n`);
    } else {
      process.stdout.write(`[HTTP] ${message}\n`);
    }
  }

  /**
   * Builds the full URL from a path.
   * Ensures the base URL has a protocol prefix.
   */
  private buildUrl(path: string): string {
    const base = this.baseUrl.startsWith('http') ? this.baseUrl : `https://${this.baseUrl}`;
    return `${base}${path}`;
  }

  /**
   * Merges default headers with request-specific headers.
   * Request headers take precedence over defaults.
   */
  private mergeHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
    return {
      ...this.defaultHeaders,
      ...additionalHeaders,
    };
  }

  /**
   * Handles the HTTP response, parsing JSON when appropriate.
   * Throws GOHttpClientError for non-2xx responses.
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    this.logDebug(`Response status: ${response.status}`);

    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json') === true;

    let responseData: unknown;
    if (isJson) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    if (!response.ok) {
      throw new GOHttpClientError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        responseData,
      );
    }

    return responseData as T;
  }

  /**
   * Extracts headers from Response object into a plain object.
   */
  private extractHeaders(response: Response): Record<string, string> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }

  /**
   * Formats the request body for logging purposes.
   * Handles Buffer, string, and object types.
   */
  private formatBodyForLog(body: unknown): string {
    if (Buffer.isBuffer(body)) {
      return `Buffer(${body.length} bytes)`;
    }
    if (typeof body === 'string') {
      return `String(${body.length} chars)`;
    }
    return JSON.stringify(body, null, 2);
  }

  /**
   * Converts the body to a format suitable for fetch.
   * Handles Buffer, string, and object serialization.
   */
  private prepareRequestBody(body: unknown): RequestBody | undefined {
    if (body === undefined) {
      return undefined;
    }

    if (Buffer.isBuffer(body)) {
      // Buffer is a Uint8Array subclass, which is valid BodyInit
      return body as Uint8Array;
    }

    if (typeof body === 'string') {
      return body;
    }

    // Serialize objects to JSON
    return JSON.stringify(body);
  }

  /**
   * Executes an HTTP request with full lifecycle management.
   *
   * @param method - HTTP method (GET, POST, PUT)
   * @param urlOrPath - URL path (relative) or full URL (for PUT)
   * @param body - Request body (for POST/PUT)
   * @param headers - Additional headers
   * @param isFullUrl - Whether urlOrPath is a complete URL
   * @returns Abortable request object
   */
  private executeRequest<T>(
    method: HttpMethod,
    urlOrPath: string,
    body?: unknown,
    headers?: Record<string, string>,
    isFullUrl: boolean = false,
  ): GOAbortableRequest<T> {
    const url = isFullUrl ? urlOrPath : this.buildUrl(urlOrPath);
    const mergedHeaders = this.mergeHeaders(headers);
    const startTime = Date.now();

    this.emit('http:request:started', { method, url, headers: mergedHeaders, body });

    if (this.debug) {
      this.logDebug(`${method} ${url}`);
      if (body !== undefined && (method === 'POST' || method === 'PUT')) {
        this.logDebug('Body', this.formatBodyForLog(body));
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const promise = (async (): Promise<T> => {
      try {
        // Build the request options
        // Note: The dispatcher property is supported by Node.js built-in fetch (undici)
        // but not included in the standard RequestInit type, so we need to cast
        const baseOptions: RequestInit = {
          method,
          headers: mergedHeaders,
          signal: controller.signal,
        };

        // Add body for POST/PUT requests
        if (body !== undefined && (method === 'POST' || method === 'PUT')) {
          const preparedBody = this.prepareRequestBody(body);
          if (preparedBody !== undefined) {
            baseOptions.body = preparedBody;
          }
        }

        // Add proxy dispatcher if configured
        // The dispatcher property is a valid undici option that Node.js fetch supports
        // but it's not part of the standard RequestInit type definition
        let fetchOptions: RequestInit;
        if (this.proxyAgent !== undefined) {
          // Cast through unknown to avoid type conflict between undici's Dispatcher
          // and the global RequestInit type. Node.js built-in fetch (powered by undici)
          // fully supports the dispatcher option for proxying requests.
          fetchOptions = {
            ...baseOptions,
            dispatcher: this.proxyAgent,
          } as unknown as RequestInit;
        } else {
          fetchOptions = baseOptions;
        }

        const response = await fetch(url, fetchOptions);
        const duration = Date.now() - startTime;

        if (method === 'PUT') {
          if (!response.ok) {
            const error = new GOHttpClientError(
              `HTTP ${response.status}: ${response.statusText}`,
              response.status,
            );
            this.emit('http:request:error', {
              method,
              url,
              error,
              status: response.status,
              duration,
            });
            throw error;
          }

          this.emit('http:response:received', {
            method,
            url,
            status: response.status,
            statusText: response.statusText,
            headers: this.extractHeaders(response),
            data: undefined,
            duration,
          });

          return undefined as T;
        }

        const result = await this.handleResponse<T>(response);

        this.emit('http:response:received', {
          method,
          url,
          status: response.status,
          statusText: response.statusText,
          headers: this.extractHeaders(response),
          data: result,
          duration,
        });

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof Error && error.name === 'AbortError') {
          const abortError = new GOHttpClientError('Request aborted');
          this.emit('http:request:error', { method, url, error: abortError, duration });
          throw abortError;
        }

        if (error instanceof Error) {
          this.emit('http:request:error', {
            method,
            url,
            error,
            status: error instanceof GOHttpClientError ? error.statusCode : undefined,
            duration,
          });
        }

        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    })();

    return {
      promise,
      abort: (): void => controller.abort(),
      controller,
    };
  }

  /**
   * Performs a GET request.
   *
   * @param path - API path (relative to baseUrl)
   * @param headers - Additional request headers
   * @returns Promise resolving to the response data
   */
  async get<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return this.getAbortable<T>(path, headers).promise;
  }

  /**
   * Performs a POST request.
   *
   * @param path - API path (relative to baseUrl)
   * @param body - Request body (will be JSON serialized if object)
   * @param headers - Additional request headers
   * @returns Promise resolving to the response data
   */
  async post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.postAbortable<T>(path, body, headers).promise;
  }

  /**
   * Performs a PUT request (typically for S3 uploads).
   *
   * @param url - Full URL (not relative path)
   * @param body - Request body (Buffer or string)
   * @param headers - Additional request headers
   * @returns Promise resolving when complete
   */
  async put(url: string, body: Buffer | string, headers?: Record<string, string>): Promise<void> {
    return this.putAbortable(url, body, headers).promise;
  }

  /**
   * Performs an abortable GET request.
   *
   * @param path - API path (relative to baseUrl)
   * @param headers - Additional request headers
   * @returns Abortable request object
   */
  getAbortable<T>(path: string, headers?: Record<string, string>): GOAbortableRequest<T> {
    return this.executeRequest<T>('GET', path, undefined, headers);
  }

  /**
   * Performs an abortable POST request.
   *
   * @param path - API path (relative to baseUrl)
   * @param body - Request body (will be JSON serialized if object)
   * @param headers - Additional request headers
   * @returns Abortable request object
   */
  postAbortable<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): GOAbortableRequest<T> {
    return this.executeRequest<T>('POST', path, body, headers);
  }

  /**
   * Performs an abortable PUT request.
   *
   * @param url - Full URL (not relative path)
   * @param body - Request body (Buffer or string)
   * @param headers - Additional request headers
   * @returns Abortable request object
   */
  putAbortable(
    url: string,
    body: Buffer | string,
    headers?: Record<string, string>,
  ): GOAbortableRequest<void> {
    return this.executeRequest<void>('PUT', url, body, headers, true);
  }
}
