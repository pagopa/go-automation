/**
 * Event emitted when an HTTP request starts
 */
export interface GOHttpClientRequestStartedEvent {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT';
  /** Request URL */
  url: string;
  /** Request headers */
  headers: Record<string, string>;
  /** Request body (if present) */
  body?: unknown;
}

/**
 * Event emitted when an HTTP response is received
 */
export interface GOHttpClientResponseReceivedEvent {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT';
  /** Request URL */
  url: string;
  /** HTTP status code */
  status: number;
  /** HTTP status text */
  statusText: string;
  /** Response headers */
  headers: Record<string, string>;
  /** Response data */
  data: unknown;
  /** Request duration in milliseconds */
  duration: number;
}

/**
 * Event emitted when an HTTP request fails
 */
export interface GOHttpClientRequestErrorEvent {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT';
  /** Request URL */
  url: string;
  /** Error that occurred */
  error: Error;
  /** HTTP status code (if available) */
  status?: number | undefined;
  /** Request duration in milliseconds */
  duration: number;
}

/**
 * Map of all HTTP client events
 * Used for type-safe event emission and listening
 */
export interface GOHttpClientEventMap {
  /** Emitted when a request starts */
  'http:request:started': GOHttpClientRequestStartedEvent;

  /** Emitted when a response is received */
  'http:response:received': GOHttpClientResponseReceivedEvent;

  /** Emitted when a request fails */
  'http:request:error': GOHttpClientRequestErrorEvent;
}
