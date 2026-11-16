import { GOHttpClient, GOHttpClientError } from '@pagopa/go-common/http';

import type { ExternalChannelsApi } from './ExternalChannelsApi.js';
import type { PaperEngagementRequest } from './PaperEngagementRequest.js';

/** Client id header of pn-external-channels. */
const CLIENT_ID_HEADER = 'x-pagopa-extch-cx-id';

/**
 * {@link ExternalChannelsApi} over HTTP, through the tunnel opened by the
 * user (§9.1). The base URL is local (e.g. `http://localhost:8888`).
 */
export class ExternalChannelsChannel implements ExternalChannelsApi {
  private readonly http: GOHttpClient;

  constructor(baseUrl: string, clientId: string, timeoutMs: number) {
    this.http = new GOHttpClient({
      baseUrl: baseUrl.replace(/\/+$/, ''),
      defaultHeaders: { 'Content-Type': 'application/json', [CLIENT_ID_HEADER]: clientId },
      timeout: timeoutMs,
    });
  }

  /**
   * Sends a paper engagement (`PUT paper-deliveries-engagements/{requestId}`).
   *
   * @param request - Paper engagement, keyed by its `requestId`
   * @throws GOHttpClientError on an HTTP error (`409` when the requestId was already used)
   */
  public async sendPaper(request: PaperEngagementRequest): Promise<void> {
    const path = `/external-channels/v1/paper-deliveries-engagements/${encodeURIComponent(request.requestId)}`;
    await this.http.request<unknown>('PUT', path, request);
  }

  /**
   * Any HTTP answer (even 404) proves the tunnel is open; only a transport
   * error (connection refused, timeout) fails.
   */
  public async healthCheck(): Promise<void> {
    try {
      await this.http.request<unknown>('GET', '/');
    } catch (error: unknown) {
      if (error instanceof GOHttpClientError && error.statusCode !== undefined) return;
      throw error;
    }
  }
}
