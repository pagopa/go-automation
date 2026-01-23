/**
 * HTTP Client configuration (framework-agnostic)
 */
export interface GOHttpClientConfig {
  /** Base URL for API requests */
  readonly baseUrl: string;
  /** Default headers to include in all requests */
  readonly defaultHeaders?: Record<string, string> | undefined;
  /** Request timeout in milliseconds (default: 30000) */
  readonly timeout?: number | undefined;
  /** Enable debug logging (default: false) */
  readonly debug?: boolean | undefined;
  /**
   * Proxy URL for debugging (e.g., "http://127.0.0.1:9090" for Proxyman)
   * When set, all requests will be routed through this proxy
   */
  readonly proxyUrl?: string | undefined;
}
