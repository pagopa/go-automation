import { Core } from '@go-automation/go-common';

import { WatchtowerAuth } from './WatchtowerAuth.js';
import type { WatchtowerAuthCredentials } from './WatchtowerAuth.js';
import type {
  AcknowledgeCancellationRequest,
  AcknowledgeCancellationResult,
  AlarmAnalysisDto,
  AlarmDto,
  AlarmEventDetailDto,
  AlarmEventDto,
  AlarmEventsPage,
  AlarmEventsQuery,
  AutomaticRunbookAttemptsResponse,
  AutomaticRunbookExecutionDto,
  AutomaticRunbookExecutionsPage,
  AutomaticRunbookExecutionsQuery,
  CancelExecutionRequest,
  CancelExecutionResult,
  CompleteExecutionRequest,
  CompleteExecutionResult,
  EnvironmentDto,
  FailExecutionRequest,
  FailExecutionResult,
  ProductDto,
  ProgressExecutionRequest,
  ProgressExecutionResponse,
  StartExecutionRequest,
  StartExecutionResponse,
} from './WatchtowerTypes.js';

export interface WatchtowerClientOptions {
  readonly baseUrl: string;
  readonly credentials: WatchtowerAuthCredentials;
  readonly timeoutMs?: number;
  readonly proxyUrl?: string;
}

export interface WatchtowerLifecycleRequestOptions {
  readonly idempotencyKey: string;
  readonly deadlineAtMs: number;
  readonly signal?: AbortSignal;
}

type AuthenticatedMethod = 'GET' | 'POST' | 'PATCH';

/** Generated-contract Watchtower client for shared read and worker lifecycle operations. */
export class WatchtowerClient {
  private readonly http: Core.GOHttpClient;
  private readonly auth: WatchtowerAuth;

  constructor(options: WatchtowerClientOptions) {
    this.http = new Core.GOHttpClient({
      baseUrl: normalizeBaseUrl(options.baseUrl),
      timeout: options.timeoutMs,
      proxyUrl: options.proxyUrl,
      defaultHeaders: { accept: 'application/json', 'content-type': 'application/json' },
    });
    this.auth = new WatchtowerAuth(this.http, options.credentials);
  }

  async login(): Promise<void> {
    await this.auth.getAccessToken();
  }

  async listProducts(): Promise<ReadonlyArray<ProductDto>> {
    return await this.authenticatedRequest<ProductDto[]>('GET', '/api/products');
  }

  async listProductAlarms(productId: string): Promise<ReadonlyArray<AlarmDto>> {
    return await this.authenticatedRequest<AlarmDto[]>('GET', `/api/products/${encodeURIComponent(productId)}/alarms`);
  }

  async listProductEnvironments(productId: string): Promise<ReadonlyArray<EnvironmentDto>> {
    return await this.authenticatedRequest<EnvironmentDto[]>(
      'GET',
      `/api/products/${encodeURIComponent(productId)}/environments`,
    );
  }

  async listAlarmEvents(query: AlarmEventsQuery): Promise<ReadonlyArray<AlarmEventDto>> {
    const events: AlarmEventDto[] = [];
    for (let page = 1; ; page += 1) {
      const result = await this.authenticatedRequest<AlarmEventsPage>(
        'GET',
        withQuery('/api/alarm-events', { ...query, page, pageSize: 1_000 }),
      );
      events.push(...result.data);
      if (result.data.length === 0 || page >= result.pagination.totalPages) return events;
    }
  }

  async getAlarmEvent(alarmEventId: string): Promise<AlarmEventDetailDto> {
    return await this.authenticatedRequest<AlarmEventDetailDto>(
      'GET',
      `/api/alarm-events/${encodeURIComponent(alarmEventId)}`,
    );
  }

  async getAnalysis(productId: string, analysisId: string): Promise<AlarmAnalysisDto> {
    return await this.authenticatedRequest<AlarmAnalysisDto>(
      'GET',
      `/api/products/${encodeURIComponent(productId)}/analyses/${encodeURIComponent(analysisId)}`,
    );
  }

  async listAutomaticRunbookExecutions(
    query: AutomaticRunbookExecutionsQuery = {},
  ): Promise<AutomaticRunbookExecutionsPage> {
    return await this.authenticatedRequest<AutomaticRunbookExecutionsPage>(
      'GET',
      withQuery('/api/automatic-runbook-executions', query),
    );
  }

  async getAutomaticRunbookExecution(executionId: string): Promise<AutomaticRunbookExecutionDto> {
    return await this.authenticatedRequest<AutomaticRunbookExecutionDto>('GET', executionPath(executionId));
  }

  async getAutomaticRunbookAttempts(executionId: string): Promise<AutomaticRunbookAttemptsResponse> {
    return await this.authenticatedRequest<AutomaticRunbookAttemptsResponse>(
      'GET',
      `${executionPath(executionId)}/attempts`,
    );
  }

  async startExecution(
    executionId: string,
    body: StartExecutionRequest,
    options: WatchtowerLifecycleRequestOptions,
  ): Promise<StartExecutionResponse> {
    return await this.lifecycleRequest<StartExecutionResponse>(
      'POST',
      `${executionPath(executionId)}/start`,
      body,
      options,
    );
  }

  async progressExecution(
    executionId: string,
    body: ProgressExecutionRequest,
    options: WatchtowerLifecycleRequestOptions,
  ): Promise<ProgressExecutionResponse> {
    return await this.lifecycleRequest<ProgressExecutionResponse>(
      'PATCH',
      `${executionPath(executionId)}/progress`,
      body,
      options,
    );
  }

  async completeExecution(
    executionId: string,
    body: CompleteExecutionRequest,
    options: WatchtowerLifecycleRequestOptions,
  ): Promise<CompleteExecutionResult> {
    return await this.lifecycleControlRequest<CompleteExecutionResult>(
      `${executionPath(executionId)}/complete`,
      body,
      options,
    );
  }

  async failExecution(
    executionId: string,
    body: FailExecutionRequest,
    options: WatchtowerLifecycleRequestOptions,
  ): Promise<FailExecutionResult> {
    return await this.lifecycleControlRequest<FailExecutionResult>(`${executionPath(executionId)}/fail`, body, options);
  }

  async acknowledgeCancellation(
    executionId: string,
    body: AcknowledgeCancellationRequest,
    options: WatchtowerLifecycleRequestOptions,
  ): Promise<AcknowledgeCancellationResult> {
    return await this.lifecycleControlRequest<AcknowledgeCancellationResult>(
      `${executionPath(executionId)}/cancel/ack`,
      body,
      options,
    );
  }

  async cancelExecution(executionId: string, body: CancelExecutionRequest): Promise<CancelExecutionResult> {
    try {
      return await this.authenticatedRequest<CancelExecutionResult>(
        'POST',
        `${executionPath(executionId)}/cancel`,
        body,
      );
    } catch (error: unknown) {
      if (error instanceof Core.GOHttpClientError && error.statusCode === 409) {
        return error.response as CancelExecutionResult;
      }
      throw error;
    }
  }

  private async lifecycleControlRequest<T>(
    path: string,
    body: unknown,
    options: WatchtowerLifecycleRequestOptions,
  ): Promise<T> {
    try {
      return await this.lifecycleRequest<T>('POST', path, body, options);
    } catch (error: unknown) {
      if (error instanceof Core.GOHttpClientError && error.statusCode === 409) return error.response as T;
      throw error;
    }
  }

  private async lifecycleRequest<T>(
    method: 'POST' | 'PATCH',
    path: string,
    body: unknown,
    options: WatchtowerLifecycleRequestOptions,
  ): Promise<T> {
    return await this.authenticatedRequest<T>(method, path, body, {
      retryPolicy: lifecycleRetryPolicy(options.idempotencyKey),
      deadlineAtMs: options.deadlineAtMs,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  }

  private async authenticatedRequest<T>(
    method: AuthenticatedMethod,
    path: string,
    body?: unknown,
    requestOptions?: Core.GOHttpRequestOptions,
  ): Promise<T> {
    let token = await this.auth.getAccessToken();
    try {
      return await this.send<T>(method, path, body, token, requestOptions);
    } catch (error: unknown) {
      if (!(error instanceof Core.GOHttpClientError) || error.statusCode !== 401) throw error;
      token = await this.auth.renewAccessToken();
      const attemptsRemaining = requestOptions?.retryPolicy === undefined ? undefined : 3 - error.attemptsUsed;
      return await this.send<T>(method, path, body, token, {
        ...requestOptions,
        ...(attemptsRemaining === undefined
          ? {}
          : { attemptBudget: Math.max(1, Math.min(3, attemptsRemaining)) as 1 | 2 | 3 }),
      });
    }
  }

  private async send<T>(
    method: AuthenticatedMethod,
    path: string,
    body: unknown,
    token: string,
    options: Core.GOHttpRequestOptions | undefined,
  ): Promise<T> {
    const headers = { authorization: `Bearer ${token}` };
    if (method === 'GET') return await this.http.get<T>(path, headers, options);
    if (method === 'PATCH') return await this.http.patch<T>(path, body, headers, options);
    return await this.http.post<T>(path, body, headers, options);
  }
}

function lifecycleRetryPolicy(idempotencyKey: string): Core.GOHttpRetryPolicy {
  return {
    enabled: true,
    idempotencyKey,
    maxAttempts: 3,
    retryableStatuses: [408, 429, 500, 502, 503, 504],
    respectRetryAfter: true,
    maxRetryAfterMs: 15_000,
  };
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '').replace(/\/api$/, '');
}

function executionPath(executionId: string): string {
  return `/api/automatic-runbook-executions/${encodeURIComponent(executionId)}`;
}

function withQuery(path: string, query: Readonly<Record<string, unknown>>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => params.append(key, toQueryStringValue(item)));
    else params.set(key, toQueryStringValue(value));
  }
  const encoded = params.toString();
  return encoded === '' ? path : `${path}?${encoded}`;
}

function toQueryStringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value.toString();
  throw new Error('Watchtower query parameters must be scalar values or scalar arrays');
}
