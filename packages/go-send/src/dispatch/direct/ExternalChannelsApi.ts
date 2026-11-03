import type { PaperEngagementRequest } from './PaperEngagementRequest.js';

/**
 * Calls of pn-external-channels used by the `direct` mode; faked in tests.
 * Failures reject with `GOHttpClientError`.
 */
export interface ExternalChannelsApi {
  /** `PUT …/paper-deliveries-engagements/{requestId}`. */
  sendPaper(request: PaperEngagementRequest): Promise<void>;
  /** Reachability of the tunnel: resolves if pn-ec answers at all. */
  healthCheck(): Promise<void>;
}
