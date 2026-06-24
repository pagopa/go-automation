import { ProxyAgent } from 'undici';
import type { Dispatcher } from 'undici';

import { GOEventEmitterBase } from '../events/GOEventEmitterBase.js';

import type { GOAbortableRequest } from './GOAbortableRequest.js';
import type { GOHttpClientConfig } from './GOHttpClientConfig.js';
import { GOHttpClientError } from './GOHttpClientError.js';
import type { GOHttpClientEventMap } from './GOHttpClientEvents.js';
import type { GOHttpMethod, GOHttpRequestOptions, GOHttpResponse, GOHttpRetryPolicy } from './GOHttpRequestOptions.js';

type ResponseMode = 'body' | 'headers';
type RequestBody = string | Uint8Array | ArrayBuffer | Blob | FormData | URLSearchParams;

const MUTATION_METHODS: ReadonlySet<GOHttpMethod> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const EXPECTED_RETRY_STATUSES: readonly [408, 429, 500, 502, 503, 504] = [408, 429, 500, 502, 503, 504];
const SENSITIVE_HEADER_NAMES: ReadonlySet<string> = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'proxy-authorization',
  'idempotency-key',
]);
const SENSITIVE_FIELD_PATTERN = /(?:password|secret|token|authorization|cookie|api.?key|idempotency.?key)/i;

/** HTTP client with explicit retry semantics and redacted lifecycle events. */
export class GOHttpClient extends GOEventEmitterBase<GOHttpClientEventMap> {
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeout: number;
  private readonly debug: boolean;
  private readonly proxyAgent: Dispatcher | undefined;

  constructor(config: GOHttpClientConfig) {
    super();
    this.baseUrl = config.baseUrl ?? '';
    this.defaultHeaders = config.defaultHeaders ?? {};
    this.timeout = config.timeout ?? 30_000;
    this.debug = config.debug ?? false;
    this.proxyAgent =
      config.proxyUrl !== undefined && config.proxyUrl.length > 0 ? new ProxyAgent(config.proxyUrl) : undefined;
  }

  async get<T>(path: string, headers?: Record<string, string>, options?: GOHttpRequestOptions): Promise<T> {
    return (await this.getWithMetadata<T>(path, headers, options)).data;
  }

  async getWithMetadata<T>(
    path: string,
    headers?: Record<string, string>,
    options?: GOHttpRequestOptions,
  ): Promise<GOHttpResponse<T>> {
    return this.executeRequest<T>('GET', path, undefined, headers, options, false, 'body').promise;
  }

  async post<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
    options?: GOHttpRequestOptions,
  ): Promise<T> {
    return (await this.postWithMetadata<T>(path, body, headers, options)).data;
  }

  async postWithMetadata<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
    options?: GOHttpRequestOptions,
  ): Promise<GOHttpResponse<T>> {
    return this.executeRequest<T>('POST', path, body, headers, options, false, 'body').promise;
  }

  async patch<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
    options?: GOHttpRequestOptions,
  ): Promise<T> {
    return (await this.patchWithMetadata<T>(path, body, headers, options)).data;
  }

  async patchWithMetadata<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
    options?: GOHttpRequestOptions,
  ): Promise<GOHttpResponse<T>> {
    return this.executeRequest<T>('PATCH', path, body, headers, options, false, 'body').promise;
  }

  async put(
    url: string,
    body: Buffer | string,
    headers?: Record<string, string>,
    options?: GOHttpRequestOptions,
  ): Promise<Record<string, string>> {
    return (await this.putWithMetadata(url, body, headers, options)).data;
  }

  async putWithMetadata(
    url: string,
    body: Buffer | string,
    headers?: Record<string, string>,
    options?: GOHttpRequestOptions,
  ): Promise<GOHttpResponse<Record<string, string>>> {
    return this.executeRequest<Record<string, string>>('PUT', url, body, headers, options, true, 'headers').promise;
  }

  async request<T>(
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
    options?: GOHttpRequestOptions,
  ): Promise<GOHttpResponse<T>> {
    return this.executeRequest<T>(normalizeHttpMethod(method), url, body, headers, options, false, 'body').promise;
  }

  getAbortable<T>(
    path: string,
    headers?: Record<string, string>,
    options?: GOHttpRequestOptions,
  ): GOAbortableRequest<T> {
    return stripMetadata(this.executeRequest<T>('GET', path, undefined, headers, options, false, 'body'));
  }

  postAbortable<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
    options?: GOHttpRequestOptions,
  ): GOAbortableRequest<T> {
    return stripMetadata(this.executeRequest<T>('POST', path, body, headers, options, false, 'body'));
  }

  patchAbortable<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
    options?: GOHttpRequestOptions,
  ): GOAbortableRequest<T> {
    return stripMetadata(this.executeRequest<T>('PATCH', path, body, headers, options, false, 'body'));
  }

  putAbortable(
    url: string,
    body: Buffer | string,
    headers?: Record<string, string>,
    options?: GOHttpRequestOptions,
  ): GOAbortableRequest<Record<string, string>> {
    return stripMetadata(
      this.executeRequest<Record<string, string>>('PUT', url, body, headers, options, true, 'headers'),
    );
  }

  private executeRequest<T>(
    method: GOHttpMethod,
    urlOrPath: string,
    body: unknown,
    headers: Record<string, string> | undefined,
    options: GOHttpRequestOptions | undefined,
    isFullUrl: boolean,
    responseMode: ResponseMode,
  ): GOAbortableRequest<GOHttpResponse<T>> {
    const controller = new AbortController();
    const url = isFullUrl ? urlOrPath : this.buildUrl(urlOrPath);
    const retryPolicy = options?.retryPolicy;
    validateRetryPolicy(method, retryPolicy, body);
    const mergedHeaders = this.mergeHeaders(headers, retryPolicy, body);
    rejectContentLength(mergedHeaders);
    const preparedBody = prepareRequestBody(body);
    const maxAttempts = retryPolicy === undefined ? 1 : (options?.attemptBudget ?? retryPolicy.maxAttempts);
    const startedAt = Date.now();
    const deadlineAt = Math.min(options?.deadlineAtMs ?? Number.POSITIVE_INFINITY, startedAt + this.timeout);

    const promise = this.runAttempts<T>({
      method,
      url,
      body,
      preparedBody,
      headers: mergedHeaders,
      options,
      retryPolicy,
      maxAttempts,
      deadlineAt,
      controller,
      responseMode,
    });

    return { promise, abort: (): void => controller.abort(), controller };
  }

  private async runAttempts<T>(request: PreparedRequest): Promise<GOHttpResponse<T>> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= request.maxAttempts; attempt += 1) {
      const remainingMs = request.deadlineAt - Date.now();
      if (remainingMs <= 0) {
        throw withAttempts(lastError ?? new GOHttpClientError('HTTP request deadline exhausted'), attempt - 1);
      }

      try {
        const result = await this.runSingleAttempt<T>(request, attempt, remainingMs);
        return { ...result, attemptsUsed: attempt };
      } catch (error: unknown) {
        lastError = error;
        if (!shouldRetry(error, request, attempt)) {
          throw withAttempts(error, attempt);
        }

        const delayMs = retryDelayMs(error, attempt, request.retryPolicy);
        const remainingAfterAttempt = request.deadlineAt - Date.now();
        if (delayMs >= remainingAfterAttempt) {
          throw withAttempts(error, attempt);
        }
        await sleep(delayMs, request.controller.signal, request.options?.signal);
      }
    }
    throw withAttempts(lastError ?? new GOHttpClientError('HTTP request failed'), request.maxAttempts);
  }

  private async runSingleAttempt<T>(
    request: PreparedRequest,
    attempt: number,
    remainingMs: number,
  ): Promise<Omit<GOHttpResponse<T>, 'attemptsUsed'>> {
    const attemptStartedAt = Date.now();
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), remainingMs);
    const signal = AbortSignal.any(
      [request.controller.signal, request.options?.signal, timeoutController.signal].filter(
        (candidate): candidate is AbortSignal => candidate !== undefined,
      ),
    );

    this.emit('http:request:started', {
      method: request.method,
      url: request.url,
      headers: redactHeaders(request.headers),
      ...(request.body === undefined ? {} : { body: redactValue(request.body) }),
    });
    this.logDebug(`${request.method} ${request.url} attempt ${attempt}/${request.maxAttempts}`);

    try {
      const response = await fetch(request.url, this.fetchOptions(request, signal));
      const duration = Date.now() - attemptStartedAt;
      if (request.responseMode === 'headers') {
        if (!response.ok) {
          throw await responseError(response, attempt);
        }
        const responseHeaders = extractHeaders(response);
        this.emitResponse(request, response, responseHeaders, duration);
        return {
          data: responseHeaders as T,
          statusCode: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        };
      }

      const result = await parseResponse<T>(response, attempt);
      this.emitResponse(request, response, result, duration);
      return {
        data: result,
        statusCode: response.status,
        statusText: response.statusText,
        headers: extractHeaders(response),
      };
    } catch (error: unknown) {
      const duration = Date.now() - attemptStartedAt;
      const normalized = normalizeTransportError(error, attempt);
      this.emit('http:request:error', {
        method: request.method,
        url: request.url,
        error: sanitizedEventError(normalized),
        status: normalized.statusCode,
        duration,
      });
      throw normalized;
    } finally {
      clearTimeout(timeout);
    }
  }

  private fetchOptions(request: PreparedRequest, signal: AbortSignal): RequestInit {
    const base: RequestInit = {
      method: request.method,
      headers: request.headers,
      signal,
      ...(request.preparedBody !== undefined && MUTATION_METHODS.has(request.method)
        ? { body: request.preparedBody }
        : {}),
    };
    return this.proxyAgent === undefined ? base : ({ ...base, dispatcher: this.proxyAgent } as unknown as RequestInit);
  }

  private emitResponse<T>(request: PreparedRequest, response: Response, data: T, duration: number): void {
    this.emit('http:response:received', {
      method: request.method,
      url: request.url,
      status: response.status,
      statusText: response.statusText,
      headers: redactHeaders(extractHeaders(response)),
      data: redactValue(data),
      duration,
    });
  }

  private buildUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    if (this.baseUrl.trim() === '') {
      throw new Error('GOHttpClient baseUrl is required for relative request paths');
    }
    const base = this.baseUrl.startsWith('http') ? this.baseUrl : `https://${this.baseUrl}`;
    return `${base}${path}`;
  }

  private mergeHeaders(
    additionalHeaders: Record<string, string> | undefined,
    retryPolicy: GOHttpRetryPolicy | undefined,
    body: unknown,
  ): Record<string, string> {
    const headers = { ...this.defaultHeaders, ...additionalHeaders };
    if (isJsonSerializableBody(body) && headerValue(headers, 'content-type') === undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (retryPolicy !== undefined) {
      const existing = headerValue(headers, 'idempotency-key');
      if (existing !== undefined && existing !== retryPolicy.idempotencyKey) {
        throw new Error('Idempotency-Key header does not match retryPolicy.idempotencyKey');
      }
      headers['Idempotency-Key'] = retryPolicy.idempotencyKey;
    }
    return headers;
  }

  private logDebug(message: string): void {
    if (this.debug) process.stdout.write(`[HTTP] ${message}\n`);
  }
}

interface PreparedRequest {
  readonly method: GOHttpMethod;
  readonly url: string;
  readonly body: unknown;
  readonly preparedBody: RequestBody | undefined;
  readonly headers: Record<string, string>;
  readonly options: GOHttpRequestOptions | undefined;
  readonly retryPolicy: GOHttpRetryPolicy | undefined;
  readonly maxAttempts: number;
  readonly deadlineAt: number;
  readonly controller: AbortController;
  readonly responseMode: ResponseMode;
}

function stripMetadata<T>(request: GOAbortableRequest<GOHttpResponse<T>>): GOAbortableRequest<T> {
  return {
    promise: request.promise.then((response) => response.data),
    abort: request.abort,
    controller: request.controller,
  };
}

function validateRetryPolicy(method: GOHttpMethod, policy: GOHttpRetryPolicy | undefined, body: unknown): void {
  if (policy === undefined) return;
  if (
    policy.enabled !== true ||
    policy.maxAttempts !== 3 ||
    policy.respectRetryAfter !== true ||
    policy.maxRetryAfterMs !== 15_000 ||
    policy.idempotencyKey.trim() === '' ||
    !sameStatuses(policy.retryableStatuses)
  ) {
    throw new Error('Invalid GOHttpRetryPolicy');
  }
  if (MUTATION_METHODS.has(method) && policy.idempotencyKey.trim() === '') {
    throw new Error(`${method} retry requires a non-empty idempotency key`);
  }
  if (isNonReplayableBody(body)) {
    throw new Error('Retry requires a replayable, materialized request body');
  }
}

function sameStatuses(statuses: ReadonlyArray<number>): boolean {
  return (
    statuses.length === EXPECTED_RETRY_STATUSES.length &&
    statuses.every((status, index) => status === EXPECTED_RETRY_STATUSES[index])
  );
}

function normalizeHttpMethod(method: string): GOHttpMethod {
  const normalized = method.trim().toUpperCase();
  if (
    normalized === 'GET' ||
    normalized === 'POST' ||
    normalized === 'PUT' ||
    normalized === 'PATCH' ||
    normalized === 'DELETE'
  ) {
    return normalized;
  }
  throw new Error(`Unsupported HTTP method: ${method}`);
}

function isNonReplayableBody(body: unknown): boolean {
  if (body instanceof ReadableStream) return true;
  return typeof body === 'object' && body !== null && 'pipe' in body && typeof body.pipe === 'function';
}

function prepareRequestBody(body: unknown): RequestBody | undefined {
  if (body === undefined) return undefined;
  if (Buffer.isBuffer(body)) return body;
  if (
    typeof body === 'string' ||
    body instanceof Uint8Array ||
    body instanceof ArrayBuffer ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams
  ) {
    return body;
  }
  return JSON.stringify(body);
}

function isJsonSerializableBody(body: unknown): boolean {
  return (
    body !== undefined &&
    typeof body !== 'string' &&
    !Buffer.isBuffer(body) &&
    !(body instanceof Uint8Array) &&
    !(body instanceof ArrayBuffer) &&
    !(body instanceof Blob) &&
    !(body instanceof FormData) &&
    !(body instanceof URLSearchParams)
  );
}

function rejectContentLength(headers: Readonly<Record<string, string>>): void {
  if (headerValue(headers, 'content-length') !== undefined) {
    throw new Error('GOHttpClient does not accept Content-Length; fetch computes it automatically');
  }
}

function headerValue(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return entry?.[1];
}

async function parseResponse<T>(response: Response, attempt: number): Promise<T> {
  const contentType = response.headers.get('content-type');
  const isJson = contentType !== null && /[/+]json\b/i.test(contentType);
  const data: unknown = isJson ? await response.json() : await response.text();
  if (!response.ok) throw createResponseError(response, data, attempt);
  return data as T;
}

async function responseError(response: Response, attempt: number): Promise<GOHttpClientError> {
  const body = await response.text();
  return createResponseError(response, body, attempt);
}

function createResponseError(response: Response, data: unknown, attempt: number): GOHttpClientError {
  return new GOHttpClientError(
    `HTTP ${response.status}: ${response.statusText}`,
    response.status,
    data,
    attempt,
    parseRetryAfter(response.headers.get('retry-after')),
  );
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function shouldRetry(error: unknown, request: PreparedRequest, attempt: number): boolean {
  if (request.retryPolicy === undefined || attempt >= request.maxAttempts) return false;
  if (request.controller.signal.aborted || request.options?.signal?.aborted === true) return false;
  if (error instanceof GOHttpClientError && error.statusCode !== undefined) {
    return request.retryPolicy.retryableStatuses.includes(error.statusCode as never);
  }
  return error instanceof GOHttpClientError && error.statusCode === undefined;
}

function retryDelayMs(error: unknown, attempt: number, policy: GOHttpRetryPolicy | undefined): number {
  if (policy === undefined) return 0;
  if (error instanceof GOHttpClientError && error.retryAfterMs !== undefined) {
    return Math.min(error.retryAfterMs, policy.maxRetryAfterMs);
  }
  const exponential = 100 * 2 ** (attempt - 1);
  return Math.round(exponential * (0.5 + Math.random()));
}

function normalizeTransportError(error: unknown, attempt: number): GOHttpClientError {
  if (error instanceof GOHttpClientError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return new GOHttpClientError('Request aborted', undefined, undefined, attempt);
  }
  const message = error instanceof Error ? error.message : String(error);
  return new GOHttpClientError(`HTTP transport error: ${message}`, undefined, undefined, attempt);
}

function withAttempts(error: unknown, attemptsUsed: number): GOHttpClientError {
  if (error instanceof GOHttpClientError) {
    return new GOHttpClientError(error.message, error.statusCode, error.response, attemptsUsed, error.retryAfterMs);
  }
  return normalizeTransportError(error, attemptsUsed);
}

async function sleep(ms: number, internalSignal: AbortSignal, externalSignal: AbortSignal | undefined): Promise<void> {
  if (ms <= 0) return;
  const signal = AbortSignal.any(
    [internalSignal, externalSignal].filter((candidate): candidate is AbortSignal => candidate !== undefined),
  );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new GOHttpClientError('Request aborted'));
      },
      { once: true },
    );
  });
}

function extractHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

function redactHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ? '[REDACTED]' : value,
    ]),
  );
}

function redactValue(value: unknown, seen: WeakSet<object> = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) return (value as unknown[]).map((item) => redactValue(item, seen));
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (value instanceof Uint8Array || value instanceof ArrayBuffer || value instanceof Blob) return '[BINARY]';
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_FIELD_PATTERN.test(key) ? '[REDACTED]' : redactValue(item, seen),
    ]),
  );
}

function sanitizedEventError(error: GOHttpClientError): Error {
  const sanitized = new Error(error.message);
  sanitized.name = error.name;
  return sanitized;
}
