/**
 * SDK Configuration
 */
export interface SENDNotificationServiceConfig {
  /** Base URL for PN API (e.g., 'api.dev.notifichedigitali.it') */
  basePath: string;
  /** API Key for authentication */
  apiKey: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Optional proxy URL for requests */
  proxyUrl?: string;
}
