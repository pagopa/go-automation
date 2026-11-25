import { GOHttpClient, GOHttpClientError } from '@pagopa/go-common/http';

import { withWatchtowerReason } from './watchtowerErrorReason.js';

import { WatchtowerAuth } from './WatchtowerAuth.js';
import type { WatchtowerAuthCredentials } from './WatchtowerAuth.js';
import type { ProductCensus } from './ProductCensus.js';
import type {
  AlarmAnalysisDto,
  AlarmDto,
  AlarmEventDetailDto,
  AlarmEventDto,
  AlarmEventsPage,
  AlarmEventsQuery,
  DownstreamDto,
  EnvironmentDto,
  FinalActionDto,
  IgnoreReasonDto,
  ProductDto,
  ResourceDto,
  RunbookDto,
  ShadowReportQuery,
  ShadowReportResponse,
} from './WatchtowerTypes.js';

export interface WatchtowerClientOptions {
  readonly baseUrl: string;
  readonly credentials: WatchtowerAuthCredentials;
  readonly timeoutMs?: number;
  readonly proxyUrl?: string;
}

/** Generated-contract Watchtower client for the shared read operations. */
export class WatchtowerClient {
  private readonly http: GOHttpClient;
  private readonly auth: WatchtowerAuth;

  constructor(options: WatchtowerClientOptions) {
    this.http = new GOHttpClient({
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
    return await this.authenticatedRequest<ProductDto[]>('/api/products');
  }

  async listProductAlarms(productId: string): Promise<ReadonlyArray<AlarmDto>> {
    return await this.authenticatedRequest<AlarmDto[]>(`/api/products/${encodeURIComponent(productId)}/alarms`);
  }

  async listProductEnvironments(productId: string): Promise<ReadonlyArray<EnvironmentDto>> {
    return await this.authenticatedRequest<EnvironmentDto[]>(
      `/api/products/${encodeURIComponent(productId)}/environments`,
    );
  }

  async listProductResources(productId: string): Promise<ReadonlyArray<ResourceDto>> {
    return await this.authenticatedRequest<ResourceDto[]>(`/api/products/${encodeURIComponent(productId)}/resources`);
  }

  async listProductDownstreams(productId: string): Promise<ReadonlyArray<DownstreamDto>> {
    return await this.authenticatedRequest<DownstreamDto[]>(
      `/api/products/${encodeURIComponent(productId)}/downstreams`,
    );
  }

  async listProductFinalActions(productId: string): Promise<ReadonlyArray<FinalActionDto>> {
    return await this.authenticatedRequest<FinalActionDto[]>(
      `/api/products/${encodeURIComponent(productId)}/final-actions`,
    );
  }

  async listProductRunbooks(productId: string): Promise<ReadonlyArray<RunbookDto>> {
    return await this.authenticatedRequest<RunbookDto[]>(`/api/products/${encodeURIComponent(productId)}/runbooks`);
  }

  /** Ignore reasons are global, not per-product: they stay outside `ProductCensus`. */
  async listIgnoreReasons(): Promise<ReadonlyArray<IgnoreReasonDto>> {
    return await this.authenticatedRequest<IgnoreReasonDto[]>('/api/ignore-reasons');
  }

  /**
   * Loads every per-product taxonomy in one bounded fan-out of five requests.
   *
   * @param productId - Watchtower product identifier
   * @returns The product taxonomies as returned by Watchtower, unfiltered
   */
  async getProductCensus(productId: string): Promise<ProductCensus> {
    const [alarms, resources, downstreams, finalActions, runbooks] = await Promise.all([
      this.listProductAlarms(productId),
      this.listProductResources(productId),
      this.listProductDownstreams(productId),
      this.listProductFinalActions(productId),
      this.listProductRunbooks(productId),
    ]);
    return { productId, alarms, resources, downstreams, finalActions, runbooks };
  }

  /**
   * Readiness dello shadow per capability e prodotto (Fase 5).
   *
   * @param query - Finestra di osservazione ed eventuale filtro prodotto
   */
  async getShadowReport(query: ShadowReportQuery = {}): Promise<ShadowReportResponse> {
    const params = new URLSearchParams();
    if (query.days !== undefined) params.set('days', String(query.days));
    if (query.productId !== undefined) params.set('productId', query.productId);
    const suffix = params.size === 0 ? '' : `?${params.toString()}`;
    return await this.authenticatedRequest<ShadowReportResponse>(
      `/api/automatic-runbook-executions/shadow-report${suffix}`,
    );
  }

  async listAlarmEvents(query: AlarmEventsQuery): Promise<ReadonlyArray<AlarmEventDto>> {
    const events: AlarmEventDto[] = [];
    for (let page = 1; ; page += 1) {
      const result = await this.authenticatedRequest<AlarmEventsPage>(
        withQuery('/api/alarm-events', { ...query, page, pageSize: 1_000 }),
      );
      events.push(...result.data);
      if (result.data.length === 0 || page >= result.pagination.totalPages) return events;
    }
  }

  /**
   * Counts the events matching the query without downloading them.
   *
   * Reads `pagination.totalItems` from a single one-item page, so the cost stays
   * constant regardless of how many occurrences the filter selects.
   *
   * @param query - The same filter accepted by {@link listAlarmEvents}
   * @returns The total number of matching alarm events
   */
  async countAlarmEvents(query: AlarmEventsQuery): Promise<number> {
    const result = await this.authenticatedRequest<AlarmEventsPage>(
      withQuery('/api/alarm-events', { ...query, page: 1, pageSize: 1 }),
    );
    return result.pagination.totalItems;
  }

  async getAlarmEvent(alarmEventId: string): Promise<AlarmEventDetailDto> {
    return await this.authenticatedRequest<AlarmEventDetailDto>(
      `/api/alarm-events/${encodeURIComponent(alarmEventId)}`,
    );
  }

  async getAnalysis(productId: string, analysisId: string): Promise<AlarmAnalysisDto> {
    return await this.authenticatedRequest<AlarmAnalysisDto>(
      `/api/products/${encodeURIComponent(productId)}/analyses/${encodeURIComponent(analysisId)}`,
    );
  }

  private async authenticatedRequest<T>(path: string): Promise<T> {
    let token = await this.auth.getAccessToken();
    try {
      return await this.send<T>(path, token);
    } catch (error: unknown) {
      if (!(error instanceof GOHttpClientError) || error.statusCode !== 401) throw error;
      token = await this.auth.renewAccessToken();
      return await this.send<T>(path, token);
    }
  }

  private async send<T>(path: string, token: string): Promise<T> {
    try {
      return await this.http.get<T>(path, { authorization: `Bearer ${token}` });
    } catch (error: unknown) {
      // Punto unico in cui il motivo applicativo entra nel messaggio. Il tipo e
      // `statusCode` restano invariati, così il retry sul 401 continua a decidere come prima.
      throw withWatchtowerReason(error);
    }
  }
}

function normalizeBaseUrl(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  const withoutTrailingSlashes = value.slice(0, end);
  return withoutTrailingSlashes.endsWith('/api') ? withoutTrailingSlashes.slice(0, -4) : withoutTrailingSlashes;
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
