import type {
  AlarmAnalysisDto,
  AlarmDto,
  AlarmEventDto,
  EnvironmentDto,
  LoginResponse,
  Paginated,
  ProductDto,
} from '../types/WatchtowerDtos.js';

import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';

/** Decompresses a gzip buffer (some runtimes/proxies don't auto-decompress fetch responses). */
const gunzipAsync = promisify(gunzip);

/** Credentials + base URL for the Watchtower API. */
export interface WatchtowerClientOptions {
  readonly baseUrl: string;
  readonly email: string;
  readonly password: string;
}

/** Query for listing alarm-event occurrences. */
export interface AlarmEventsQuery {
  readonly alarmId: string;
  readonly environmentId?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

/** Loads one page of a paginated endpoint. */
type PageLoaderFn<T> = (page: number) => Promise<Paginated<T>>;

const PAGE_SIZE = 1000;

/**
 * Minimal, read-only client for the Watchtower REST API.
 *
 * Mirrors the frontend's bearer flow without NextAuth: `POST /auth/login`
 * yields an access token used on every call; on `401` it re-logs in once and
 * retries. Always paginates list endpoints (`pageSize=1000`).
 */
export class WatchtowerClient {
  private readonly baseUrl: string;
  private readonly email: string;
  private readonly password: string;
  private accessToken: string | undefined;

  constructor(options: WatchtowerClientOptions) {
    // Normalize to the backend root: `/auth/*` and `/api/*` are siblings off it
    // (as in the frontend). A trailing `/api` (e.g. ".../bff/api") is stripped so
    // both `${root}/auth/login` and `${root}/api/...` resolve correctly.
    this.baseUrl = options.baseUrl.replace(/\/+$/, '').replace(/\/api$/, '');
    this.email = options.email;
    this.password = options.password;
  }

  /** Authenticates and stores the access token. */
  async login(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!response.ok) {
      throw new Error(
        `Watchtower login fallito (${response.status} ${response.statusText}). Verifica URL e credenziali.`,
      );
    }
    const body = await this.readJson<LoginResponse>(response);
    if (typeof body.accessToken !== 'string' || body.accessToken === '') {
      throw new Error('La risposta di login Watchtower non contiene un accessToken.');
    }
    this.accessToken = body.accessToken;
  }

  /** Lists products (`GET /api/products`). */
  async listProducts(): Promise<ReadonlyArray<ProductDto>> {
    const data = await this.get<Paginated<ProductDto> | ProductDto[]>('/api/products', { pageSize: PAGE_SIZE });
    return this.unwrapList(data);
  }

  /** Lists the alarms of a product (`GET /api/products/:productId/alarms`). */
  async listProductAlarms(productId: string): Promise<ReadonlyArray<AlarmDto>> {
    const data = await this.get<Paginated<AlarmDto> | AlarmDto[]>(`/api/products/${productId}/alarms`, {
      pageSize: PAGE_SIZE,
    });
    return this.unwrapList(data);
  }

  /** Lists the environments of a product (`GET /api/products/:productId/environments`). */
  async listProductEnvironments(productId: string): Promise<ReadonlyArray<EnvironmentDto>> {
    const data = await this.get<Paginated<EnvironmentDto> | EnvironmentDto[]>(
      `/api/products/${productId}/environments`,
      { pageSize: PAGE_SIZE },
    );
    return this.unwrapList(data);
  }

  /** Lists all occurrences of an alarm in a period (paginated). */
  async listAlarmEvents(query: AlarmEventsQuery): Promise<ReadonlyArray<AlarmEventDto>> {
    return this.collectPages<AlarmEventDto>(async (page) =>
      this.get<Paginated<AlarmEventDto>>('/api/alarm-events', {
        alarmId: query.alarmId,
        ...(query.environmentId !== undefined ? { environmentId: query.environmentId } : {}),
        ...(query.dateFrom !== undefined ? { dateFrom: query.dateFrom } : {}),
        ...(query.dateTo !== undefined ? { dateTo: query.dateTo } : {}),
        sortBy: 'firedAt',
        page,
        pageSize: PAGE_SIZE,
      }),
    );
  }

  /** Fetches a single analysis (`GET /api/products/:productId/analyses/:id`). */
  async getAnalysis(productId: string, analysisId: string): Promise<AlarmAnalysisDto> {
    return this.get<AlarmAnalysisDto>(`/api/products/${productId}/analyses/${analysisId}`);
  }

  private unwrapList<T>(data: Paginated<T> | T[]): ReadonlyArray<T> {
    return Array.isArray(data) ? data : data.data;
  }

  private async collectPages<T>(loadPage: PageLoaderFn<T>): Promise<ReadonlyArray<T>> {
    const items: T[] = [];
    for (let page = 1; ; page += 1) {
      const result = await loadPage(page);
      items.push(...result.data);
      if (result.data.length === 0 || page >= result.pagination.totalPages) break;
    }
    return items;
  }

  private async get<T>(path: string, query?: Readonly<Record<string, string | number>>): Promise<T> {
    const url = this.buildUrl(path, query);

    let response = await this.fetchWithAuth(url);
    if (response.status === 401) {
      await this.login();
      response = await this.fetchWithAuth(url);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const detail = text === '' ? '' : `: ${text.slice(0, 200)}`;
      throw new Error(`Watchtower GET ${path} fallito (${response.status} ${response.statusText})${detail}`);
    }
    return this.readJson<T>(response);
  }

  /** Reads the response body as JSON, transparently gunzip-ing it when needed. */
  private async readJson<T>(response: Response): Promise<T> {
    const buffer = Buffer.from(await response.arrayBuffer());
    const isGzip = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
    const text = (isGzip ? await gunzipAsync(buffer) : buffer).toString('utf-8');
    return JSON.parse(text) as T;
  }

  private async fetchWithAuth(url: string): Promise<Response> {
    return fetch(url, {
      headers: { authorization: `Bearer ${this.accessToken ?? ''}`, accept: 'application/json' },
    });
  }

  private buildUrl(path: string, query?: Readonly<Record<string, string | number>>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query !== undefined) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}
